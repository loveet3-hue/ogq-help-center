/* OGQ 고객센터 — 고객용 페이지 공용 스크립트
 * 화면 구성은 젠데스크 고객센터(supportogq.zendesk.com/hc) 테마를 그대로 옮겼고,
 * 젠데스크가 하던 일(도움말 문서, 검색, 문의 접수, 내 문의)은 이 스크립트와 Apps Script API가 맡는다. */
(function () {
  var CFG = window.OGQ_HELP || {};
  var page = document.body.getAttribute('data-page');

  function $(s, r) { return (r || document).querySelector(s); }
  function $all(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
  function linkify(s) { return esc(s).replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>'); }
  function qs(name) { var m = new RegExp('[?&]' + name + '=([^&#]*)').exec(location.search); return m ? decodeURIComponent(m[1].replace(/\+/g, ' ')) : ''; }
  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function kdate(v) {
    var d = new Date(v);
    if (isNaN(d)) return '';
    return d.getFullYear() + '년 ' + (d.getMonth() + 1) + '월 ' + d.getDate() + '일 ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }
  function rel(v) {
    var m = Math.round((Date.now() - new Date(v).getTime()) / 60000);
    if (m < 1) return '방금';
    if (m < 60) return m + '분 전';
    var h = Math.round(m / 60);
    if (h < 24) return h + '시간 전';
    var d = Math.round(h / 24);
    if (d < 30) return d + '일 전';
    var mo = Math.round(d / 30);
    return mo < 12 ? mo + '개월 전' : Math.round(mo / 12) + '년 전';
  }
  var AGENT_ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" focusable="false" aria-hidden="true" viewBox="0 0 12 12" class="icon-agent"><path fill="currentColor" d="M6 0C2.7 0 0 2.7 0 6s2.7 6 6 6 6-2.7 6-6-2.7-6-6-6zm0 2c1.1 0 2 .9 2 2s-.9 2-2 2-2-.9-2-2 .9-2 2-2zm2.3 7H3.7c-.3 0-.4-.3-.3-.5C3.9 7.6 4.9 7 6 7s2.1.6 2.6 1.5c.1.2 0 .5-.3.5z"/></svg>';
  // DOMParser는 이미지 등을 내려받지 않는다 (div.innerHTML은 문서 이미지를 전부 불러옴)
  function strip(html) { var d = new DOMParser().parseFromString(html, 'text/html'); return (d.body.textContent || '').replace(/\s+/g, ' ').trim(); }

  /* ───────── 공통: 모바일 메뉴, 맨 위로 ───────── */
  var mb = $('.menu-button-mobile');
  if (mb) mb.addEventListener('click', function () {
    var open = mb.getAttribute('aria-expanded') === 'true';
    mb.setAttribute('aria-expanded', String(!open));
    var nav = $('#user-nav-mobile');
    if (nav) nav.setAttribute('aria-expanded', String(!open));
  });
  var topBtn = $('.scroll-to-top');
  if (topBtn) {
    window.addEventListener('scroll', function () { topBtn.classList.toggle('show', window.scrollY > 300); }, { passive: true });
    topBtn.addEventListener('click', function () { window.scrollTo({ top: 0, behavior: 'smooth' }); });
  }

  /* ───────── API ───────── */
  function api(action, payload) {
    if (!CFG.API_URL || CFG.API_URL === 'MOCK') return mock(action, payload || {});
    if (action === 'config') return fetch(CFG.API_URL + '?action=config').then(function (r) { return r.json(); }).then(unwrap);
    var body = JSON.stringify(Object.assign({ action: action }, payload || {}));
    // text/plain 이면 CORS 사전 요청 없이 Apps Script로 바로 간다
    return fetch(CFG.API_URL, { method: 'POST', body: body, headers: { 'Content-Type': 'text/plain;charset=utf-8' } })
      .then(function (r) { return r.json(); }).then(unwrap);
  }
  function unwrap(j) {
    if (!j || !j.ok) throw new Error((j && j.error) || '일시적인 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.');
    return j.data;
  }
  var cfgP = null;
  function getConfig() {
    if (cfgP) return cfgP;
    var c = null;
    try { c = JSON.parse(sessionStorage.getItem('ogq_help_cfg2') || 'null'); } catch (e) { }
    if (c && Date.now() - c.t < 600000) return (cfgP = Promise.resolve(c.d));
    return (cfgP = api('config').then(function (d) { try { sessionStorage.setItem('ogq_help_cfg2', JSON.stringify({ t: Date.now(), d: d })); } catch (e) { } return d; }));
  }

  /* ───────── 도움말 문서 데이터 (assets/kb.json — 젠데스크에서 옮긴 문서) ───────── */
  var kbP = null;
  function kb() {
    if (kbP) return kbP;
    return (kbP = fetch('assets/kb.json').then(function (r) { return r.json(); }).then(function (d) {
      d.cat = {}; d.sec = {}; d.art = {};
      d.categories.forEach(function (c) { d.cat[c.id] = c; });
      d.sections.forEach(function (s) { d.sec[s.id] = s; });
      d.articles.forEach(function (a) { d.art[a.id] = a; a.text = strip(a.body); });
      d.articlesOf = function (sid) { return d.articles.filter(function (a) { return a.section_id === sid; }).sort(function (a, b) { return a.position - b.position || new Date(b.created_at) - new Date(a.created_at); }); };
      d.sectionsOf = function (cid) { return d.sections.filter(function (s) { return s.category_id === cid && !s.parent_section_id; }).sort(function (a, b) { return a.position - b.position; }); };
      return d;
    }));
  }
  function crumbs(list) {
    var el = $('#crumbs');
    if (!el) return;
    el.innerHTML = '<li><a href="index.html">OGQ 고객센터</a></li>' + list.map(function (x) {
      return '<li><a href="' + (x.href || '#') + '"' + (x.href ? '' : ' aria-current="page"') + '>' + esc(x.t) + '</a></li>';
    }).join('');
  }
  function notFound(el) { el.innerHTML = '<header class="page-header"><h1>페이지를 찾을 수 없습니다</h1></header><p><a href="index.html">고객센터 홈으로 돌아가기</a></p>'; }

  /* 검색 — 모든 단어가 들어간 문서, 제목 일치에 가중치 */
  function searchKb(d, q) {
    var words = q.toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return [];
    return d.articles.map(function (a) {
      var t = a.title.toLowerCase(), b = a.text.toLowerCase(), score = 0;
      for (var i = 0; i < words.length; i++) {
        var inT = t.indexOf(words[i]) >= 0, inB = b.indexOf(words[i]) >= 0;
        if (!inT && !inB) return null;
        score += (inT ? 10 : 0) + (inB ? 1 : 0);
      }
      return { a: a, score: score };
    }).filter(Boolean).sort(function (x, y) { return y.score - x.score; }).map(function (x) { return x.a; });
  }
  function reEsc(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  function snippet(text, q) {
    var w = q.split(/\s+/).filter(Boolean)[0] || '';
    var i = w ? text.toLowerCase().indexOf(w.toLowerCase()) : -1;
    var s = i > 60 ? '…' + text.slice(i - 50, i + 150) : text.slice(0, 200);
    if (text.length > 200) s += '…';
    var h = esc(s);
    q.split(/\s+/).filter(Boolean).forEach(function (x) { h = h.replace(new RegExp('(' + reEsc(esc(x)) + ')', 'gi'), '<em>$1</em>'); });
    return h;
  }

  /* 즉시 검색(젠데스크 instant search와 같은 동작) */
  function instantSearch(input) {
    var box = document.createElement('div');
    box.className = 'kb-instant';
    input.parentNode.style.position = 'relative';
    input.parentNode.appendChild(box);
    var timer;
    input.addEventListener('input', function () {
      clearTimeout(timer);
      var q = input.value.trim();
      if (q.length < 2) { box.style.display = 'none'; return; }
      timer = setTimeout(function () {
        kb().then(function (d) {
          var r = searchKb(d, q).slice(0, 6);
          if (!r.length) { box.style.display = 'none'; return; }
          box.innerHTML = r.map(function (a) {
            var s = d.sec[a.section_id] || {}, c = d.cat[s.category_id] || {};
            return '<a href="article.html?id=' + a.id + '"><b>' + esc(a.title) + '</b><span>' + esc(c.name || '') + ' › ' + esc(s.name || '') + '</span></a>';
          }).join('') + '<a class="kb-instant__all" href="search.html?query=' + encodeURIComponent(q) + '">"' + esc(q) + '" 검색 결과 모두 보기</a>';
          box.style.display = 'block';
        });
      }, 150);
    });
    document.addEventListener('click', function (e) { if (!box.contains(e.target) && e.target !== input) box.style.display = 'none'; });
  }
  $all('form.search input[type=search]').forEach(function (i) {
    if (page !== 'search') instantSearch(i);
    i.closest('form').addEventListener('submit', function (e) { if (!i.value.trim()) e.preventDefault(); });
  });

  /* ───────── 첫 화면: 1:1 문의하기 (서비스·문의 유형 칩, 젠데스크 홈과 같은 목록) ───────── */
  function initIndex() {
    var root = $('.ogq-contact');
    if (!root) return;
    var SERVICES = [
      { key: 'ocs', name: '크리에이터 스튜디오', types: [
        ['ocs_심사', '심사 반려사유'], ['ocs_승인', '승인 요청'], ['ocs_정산', '수익금 정산'], ['ocs_수정', '콘텐츠 수정'],
        ['ocs_계정', '계정(탈퇴/비밀번호)'], ['ocs_사업자', '사업자 정보 등록'], ['ocs_서비스', '서비스 이용 방법'],
        ['ocs_오류', '시스템 오류/버그'], ['ocs_저작권', '콘텐츠 저작권'], ['ocs_신고', '신고'], ['ocs_ai', 'AI 콘텐츠/시스템'],
        ['ocs_증명서', '예술활동증명 확인서'], ['ocs_콘텐츠_무료_등록', '무료 등록'], ['ocs_타플랫폼_판매_문의', '타 플랫폼 판매'], ['ocs_밴드', '밴드'], ['ocs_기타', '기타']] },
      { key: 'nom', name: 'NAVER OGQ마켓', types: [
        ['nom_구매_환불', '구매/환불'], ['nom_선물하기', '선물하기'], ['nom_이용_다운로드', '이용·다운로드'],
        ['nom_계정', '계정 관련'], ['nom_오류', '오류/건의'], ['nom_이벤트', '이벤트'], ['nom_기타', '기타']] },
      { key: 'som', name: 'SOOP OGQ마켓', types: [
        ['som_퍼블리시티권', '퍼블리시티권'], ['som_마켓확장', '마켓 확장 판매'], ['som_크루티콘', '크루티콘 세팅'],
        ['som_피처드', '피처드'], ['som_이벤트', '이벤트'], ['som_기타', '기타']] },
      { key: 'com', name: '채팅+ OGQ마켓', types: [
        ['com_환불', '결제/환불'], ['com_선물하기', '선물하기'], ['com_이용방법', '서비스 이용 방법'],
        ['com_오류_및_건의', '오류 및 건의'], ['com_이관', '이관 신청'], ['com_기타', '기타']] },
      { key: 'gra', name: '그라폴리오', types: [
        ['gra_탈퇴', '계정 탈퇴'], ['gra_이관신청', '이관 신청'], ['gra_아이디비번찾기', '아이디/비밀번호 찾기'], ['gra_기타', '기타']] },
      { key: 'mp', name: '광고 & 제휴', types: [] }
    ];
    var svcBox = $('#ogqSvc'), typeBox = $('#ogqType'), go = $('#ogqGo'), goText = $('#ogqGoText'), typeQ = $('#ogqTypeQ');
    var cur = SERVICES[0], curType = null;
    function url() { return 'request.html?service=' + encodeURIComponent(cur.key) + (curType ? '&category=' + encodeURIComponent(curType) : ''); }
    function chip(label, on, fn) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'ogq-chip' + (on ? ' is-on' : ''); b.textContent = label;
      b.addEventListener('click', fn);
      return b;
    }
    function render() {
      svcBox.innerHTML = '';
      SERVICES.forEach(function (s) {
        svcBox.appendChild(chip(s.name, s === cur, function () {
          cur = s; curType = null; render(); // 광고 & 제휴도 다른 서비스처럼 선택만(문의는 아래 '제휴 제안하러 가기'로)
        }));
      });
      typeBox.innerHTML = '';
      if (!cur.types.length) {
        typeQ.style.display = 'none';
        var n = document.createElement('p');
        n.className = 'ogq-adnote';
        n.textContent = '광고·제휴 제안은 문의로 남겨주시면 담당자가 확인 후 연락드려요.';
        typeBox.appendChild(n);
        go.href = url(); goText.textContent = '제휴 제안하러 가기';
        return;
      }
      typeQ.style.display = '';
      cur.types.forEach(function (t) { typeBox.appendChild(chip(t[1], t[0] === curType, function () { curType = t[0]; render(); })); });
      go.href = url(); goText.textContent = '문의 작성하기';
    }
    render();
  }

  /* ───────── 문서 ───────── */
  function initArticle() {
    var id = Number(qs('id'));
    var box = $('#article-container');
    kb().then(function (d) {
      var a = d.art[id];
      if (!a) { notFound(box); return; }
      var s = d.sec[a.section_id] || {}, c = d.cat[s.category_id] || {};
      document.title = a.title + ' – OGQ 고객센터';
      crumbs([{ t: c.name, href: 'category.html?id=' + c.id }, { t: s.name, href: 'section.html?id=' + s.id }]);
      var siblings = d.articlesOf(a.section_id);
      var recent = [];
      try { recent = JSON.parse(localStorage.getItem('ogq_recent') || '[]'); } catch (e) { }
      var recentOthers = recent.filter(function (x) { return x !== id && d.art[x]; }).slice(0, 5);
      try { localStorage.setItem('ogq_recent', JSON.stringify([id].concat(recent.filter(function (x) { return x !== id; })).slice(0, 10))); } catch (e) { }
      var related = siblings.filter(function (x) { return x.id !== id; }).slice(0, 5);
      var voted = '';
      try { voted = localStorage.getItem('ogq_vote_' + id) || ''; } catch (e) { }
      var when = a.edited_at || a.updated_at;
      box.innerHTML =
        '<aside class="article-sidebar" aria-labelledby="section-articles-title"><div class="collapsible-sidebar">' +
        '<span id="section-articles-title" class="collapsible-sidebar-title sidenav-title">이 섹션의 문서</span>' +
        '<div class="collapsible-sidebar-body"><ul>' + siblings.map(function (x) {
          return '<li><a href="article.html?id=' + x.id + '" class="sidenav-item' + (x.id === id ? ' current-article" aria-current="page' : '') + '">' + esc(x.title) + '</a></li>';
        }).join('') + '</ul></div></div></aside>' +
        '<article id="main-content" class="article"><header class="article-header"><h1 title="' + esc(a.title) + '" class="article-title">' + esc(a.title) + '</h1>' +
        '<div class="article-author"><div class="avatar article-avatar">' + AGENT_ICON + '<img src="assets/img/avatar.svg" alt="" class="user-avatar"></div><div class="article-meta">관리자' +
        '<div class="meta-group"><span class="meta-data"><time datetime="' + esc(when) + '" title="' + esc(kdate(when)) + '">' + rel(when) + '</time></span></div></div></div></header>' +
        '<section class="article-info"><div class="article-content"><div class="article-body">' + a.body + '</div></div></section>' +
        '<footer><div class="article-footer"></div><div class="article-votes"><h2 class="article-votes-question" id="article-votes-label">도움이 되었습니까?</h2>' +
        '<div class="article-votes-controls" role="group" aria-labelledby="article-votes-label">' +
        '<button type="button" class="button article-vote article-vote-up" data-v="up" aria-label="이 문서가 유용했음" aria-pressed="' + (voted === 'up') + '">예</button>' +
        '<button type="button" class="button article-vote article-vote-down" data-v="down" aria-label="이 문서가 유용하지 않았음" aria-pressed="' + (voted === 'down') + '">아니요</button></div>' +
        '<small class="article-votes-count"><span class="article-vote-label" id="voteMsg">' + (voted ? '의견을 보내 주셔서 감사합니다.' : '') + '</span></small></div>' +
        '<div class="article-more-questions">또 다른 질문이 있으십니까? <a href="request.html">문의 등록</a></div>' +
        '<div class="article-return-to-top"><a href="#article-container">맨 위로 돌아가기 <svg xmlns="http://www.w3.org/2000/svg" class="article-return-to-top-icon" width="20" height="20" focusable="false" viewBox="0 0 12 12" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-linecap="round" d="M10.5 8.5L6 4 1.5 8.5"/></svg></a></div></footer>' +
        '<div class="article-relatives">' +
        (recentOthers.length ? '<section class="recent-articles"><h2 class="recent-articles-title">최근 본 문서</h2><ul>' + recentOthers.map(function (x) { return '<li><a href="article.html?id=' + x + '">' + esc(d.art[x].title) + '</a></li>'; }).join('') + '</ul></section>' : '') +
        (related.length ? '<section class="related-articles"><h2 class="related-articles-title">관련 문서</h2><ul>' + related.map(function (x) { return '<li><a href="article.html?id=' + x.id + '">' + esc(x.title) + '</a></li>'; }).join('') + '</ul></section>' : '') +
        '</div></article>';
      $all('.article-vote', box).forEach(function (b) {
        b.addEventListener('click', function () {
          var v = b.getAttribute('data-v');
          try { localStorage.setItem('ogq_vote_' + id, v); } catch (e) { }
          $all('.article-vote', box).forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
          $('#voteMsg').textContent = '의견을 보내 주셔서 감사합니다.';
          api('vote', { id: id, vote: v }).catch(function () { });
        });
      });
    }).catch(function () { notFound(box); });
  }

  /* ───────── 카테고리 / 섹션 ───────── */
  function initCategory() {
    var id = Number(qs('id'));
    var el = $('#kb-main');
    kb().then(function (d) {
      var c = d.cat[id];
      if (!c) { notFound(el); return; }
      document.title = c.name + ' – OGQ 고객센터';
      crumbs([{ t: c.name }]);
      el.innerHTML = '<header class="page-header"><h1>' + esc(c.name) + '</h1>' + (c.description ? '<p class="page-header-description">' + esc(c.description) + '</p>' : '') + '</header>' +
        '<div id="main-content" class="section-tree">' + d.sectionsOf(id).map(function (s) {
          var arts = d.articlesOf(s.id);
          return '<section class="section"><h2 class="section-tree-title"><a href="section.html?id=' + s.id + '">' + esc(s.name) + '</a></h2>' +
            '<ul class="article-list">' + arts.slice(0, 6).map(function (a) {
              return '<li class="article-list-item' + (a.promoted ? ' article-promoted' : '') + '"><a href="article.html?id=' + a.id + '" class="article-list-link">' + esc(a.title) + '</a></li>';
            }).join('') + '</ul>' + (arts.length > 6 ? '<a href="section.html?id=' + s.id + '" class="see-all-articles">문서 ' + arts.length + '개 모두 보기</a>' : '') + '</section>';
        }).join('') + '</div>';
    }).catch(function () { notFound(el); });
  }
  function initSection() {
    var id = Number(qs('id'));
    var el = $('#main-content');
    kb().then(function (d) {
      var s = d.sec[id];
      if (!s) { notFound(el); return; }
      var c = d.cat[s.category_id] || {};
      document.title = s.name + ' – OGQ 고객센터';
      crumbs([{ t: c.name, href: 'category.html?id=' + c.id }, { t: s.name, href: 'section.html?id=' + s.id }]);
      el.innerHTML = '<header class="page-header"><h1>' + esc(s.name) + '</h1>' + (s.description ? '<p class="page-header-description">' + esc(s.description) + '</p>' : '') + '</header>' +
        '<ul class="article-list">' + d.articlesOf(id).map(function (a) {
          return '<li class="article-list-item' + (a.promoted ? ' article-promoted' : '') + '"><a href="article.html?id=' + a.id + '" class="article-list-link">' + esc(a.title) + '</a></li>';
        }).join('') + '</ul>';
    }).catch(function () { notFound(el); });
  }

  /* ───────── 검색 결과 ───────── */
  function initSearch() {
    var q = qs('query').trim();
    var el = $('#kb-main');
    $all('input[name=query]').forEach(function (i) { i.value = q; });
    document.title = (q ? '"' + q + '" 검색 결과' : '검색 결과') + ' – OGQ 고객센터';
    kb().then(function (d) {
      var r = q ? searchKb(d, q) : [];
      var link = 'search.html?query=' + encodeURIComponent(q);
      el.innerHTML = '<aside class="search-results-sidebar"><section class="filters-in-section collapsible-sidebar"><h3 class="collapsible-sidebar-title sidenav-title">유형</h3>' +
        '<ul class="multibrand-filter-list"><li><a href="' + link + '" class="sidenav-item current" aria-current="page"><span class="sidenav-subitem filter-name">모든 유형</span> <span class="sidenav-subitem doc-count">(' + r.length + ')</span></a></li>' +
        '<li><a href="' + link + '" class="sidenav-item"><span class="sidenav-subitem filter-name">문서</span> <span class="sidenav-subitem doc-count">(' + r.length + ')</span></a></li></ul></section></aside>' +
        '<section id="main-content" class="search-results-column">' +
        (r.length ? '<h1 class="search-results-subheading">"' + esc(q) + '"에 대한 ' + r.length + '개의 결과</h1><ul class="search-results-list">' + r.map(function (a) {
          var s = d.sec[a.section_id] || {}, c = d.cat[s.category_id] || {};
          return '<li><article><header><div class="search-result-title-container"><h2 class="search-result-title"><a href="article.html?id=' + a.id + '">' + esc(a.title) + '</a></h2></div>' +
            '<div class="search-result-meta-container"><nav><ol class="breadcrumbs search-result-breadcrumbs"><li><a href="category.html?id=' + c.id + '">' + esc(c.name) + '</a></li><li><a href="section.html?id=' + s.id + '">' + esc(s.name) + '</a></li></ol></nav>' +
            '<span class="meta-data">관리자</span><span class="meta-data"><time datetime="' + esc(a.updated_at) + '">' + esc(kdate(a.updated_at)) + '</time></span></div></header>' +
            '<p class="search-result-description">' + snippet(a.text, q) + '</p></article></li>';
        }).join('') + '</ul>' :
          '<h1 class="search-results-subheading">' + (q ? '"' + esc(q) + '"에 대한 결과가 없습니다.' : '검색어를 입력해 주세요.') + '</h1>' +
          '<div class="no-results"><p>다른 검색어로 찾아보거나 <a href="request.html">문의를 남겨 주세요</a>.</p></div>') +
        '</section>';
    });
  }

  /* ───────── 첨부 (끌어다 놓기 포함) ───────── */
  function setupFiles(input, listEl, cls) {
    var files = [], MAX = 15 * 1024 * 1024;
    function draw() {
      listEl.innerHTML = files.map(function (f, i) {
        return '<span class="' + cls + '">' + esc(f.name) + ' <button type="button" data-i="' + i + '" aria-label="삭제">✕</button></span>';
      }).join('');
      $all('button', listEl).forEach(function (b) { b.addEventListener('click', function () { files.splice(Number(b.getAttribute('data-i')), 1); draw(); }); });
    }
    function add(list) {
      var more = Array.prototype.slice.call(list);
      var total = files.concat(more).reduce(function (s, f) { return s + f.size; }, 0);
      if (files.length + more.length > 5) alert('첨부 파일은 5개까지 올릴 수 있습니다.');
      else if (total > MAX) alert('첨부 파일은 모두 합쳐 15MB까지 올릴 수 있습니다.');
      else files = files.concat(more);
      input.value = '';
      draw();
    }
    input.addEventListener('change', function () { add(input.files); });
    var zone = input.closest('.zd-drop');
    if (zone) {
      ['dragenter', 'dragover'].forEach(function (ev) { zone.addEventListener(ev, function (e) { e.preventDefault(); zone.classList.add('over'); }); });
      ['dragleave', 'drop'].forEach(function (ev) { zone.addEventListener(ev, function (e) { e.preventDefault(); zone.classList.remove('over'); }); });
      zone.addEventListener('drop', function (e) { if (e.dataTransfer && e.dataTransfer.files.length) add(e.dataTransfer.files); });
    }
    return function () { return files; };
  }
  function readFiles(list) {
    return Promise.all(list.map(function (f) {
      return new Promise(function (res, rej) {
        var r = new FileReader();
        r.onload = function () { res({ name: f.name, type: f.type, data: String(r.result).split(',')[1] }); };
        r.onerror = rej;
        r.readAsDataURL(f);
      });
    }));
  }

  /* ───────── 문의 등록 ─────────
   * 양식 항목은 assets/form.js(젠데스크 문의 양식과 같은 정의)를 쓴다.
   * 문의 내용은 데스크톱에서 CKEditor(젠데스크와 같은 편집기), 모바일에서는 일반 입력칸 — 젠데스크와 같다. */
  function initRequest() {
    var FORM = window.OGQ_FORM || { services: [], templates: {} };
    var getFiles = setupFiles($('#files'), $('#fileList'), 'zd-file');
    var svcSel = $('#svc'), catSel = $('#cat'), body = $('#body');
    var editor = null, lastTpl = '', touched = false;
    var isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

    function svcOf(code) { return FORM.services.filter(function (s) { return s.code === code; })[0]; }
    function textToHtml(t) { return String(t).split('\n').map(function (line) { return '<p>' + (line.length ? esc(line) : '&nbsp;') + '</p>'; }).join(''); }
    function htmlToText(html) {
      var doc = new DOMParser().parseFromString(html, 'text/html');
      var out = [];
      $all('p, li, h1, h2, h3, h4, blockquote, pre', doc.body).forEach(function (el) {
        if (el.closest('li') && el.tagName !== 'LI') return;
        var txt = el.textContent.replace(/ /g, ' ');
        if (el.tagName === 'LI') txt = '- ' + txt;
        if (el.tagName === 'BLOCKQUOTE') txt = '> ' + txt;
        out.push(txt);
      });
      if (!out.length) out.push(doc.body.textContent || '');
      return out.join('\n').replace(/\s+$/, '');
    }
    function getBody() { return editor ? htmlToText(editor.getData()) : body.value; }
    function setBody(t) { if (editor) editor.setData(textToHtml(t)); else body.value = t; }
    function fillTemplate(code) {
      var tpl = (code && FORM.templates[code]) || '';
      // 고객이 직접 쓴 내용이 있으면 덮어쓰지 않는다 (젠데스크 스크립트와 같은 동작)
      var cur = getBody().trim();
      if (!cur || !touched || cur === lastTpl.trim()) { setBody(tpl); lastTpl = tpl; touched = false; }
    }

    if (!isMobile && window.ClassicEditor) {
      ClassicEditor.create(body, {
        language: 'ko',
        toolbar: ['heading', '|', 'bold', 'italic', '|', 'link', 'bulletedList', 'numberedList', 'blockQuote', '|', 'undo', 'redo'],
        heading: { options: [
          { model: 'paragraph', title: '단락', class: 'ck-heading_paragraph' },
          { model: 'heading2', view: 'h2', title: '제목 1', class: 'ck-heading_heading2' },
          { model: 'heading3', view: 'h3', title: '제목 2', class: 'ck-heading_heading3' }
        ] }
      }).then(function (ed) {
        editor = ed;
        ed.model.document.on('change:data', function () { if (getBody().trim() !== lastTpl.trim()) touched = true; });
        if (lastTpl) setBody(lastTpl);
      }).catch(function (e) { console.warn('편집기를 불러오지 못해 일반 입력칸을 씁니다', e); });
    }
    body.addEventListener('input', function () { touched = true; });

    svcSel.innerHTML = '<option value="">-</option>' + FORM.services.map(function (s) { return '<option value="' + esc(s.code) + '">' + esc(s.name) + '</option>'; }).join('');
    function pickSvc(code, cat) {
      svcSel.value = code;
      var s = svcOf(code);
      var cats = s ? s.categories : [];
      if (cats.length > 1) {
        $('#catField').classList.remove('hidden');
        $('#catLabel').textContent = s.typeLabel || (s.name + ' 문의 유형');
        catSel.innerHTML = '<option value="">-</option>' + cats.map(function (c) { return '<option value="' + esc(c[0]) + '">' + esc(c[1]) + '</option>'; }).join('');
        catSel.value = cat && cats.some(function (c) { return c[0] === cat; }) ? cat : '';
      } else {
        // 문의 유형이 따로 없는 서비스(채팅+ 원스토어, 광고&제휴 등)는 젠데스크처럼 유형 칸을 숨긴다
        $('#catField').classList.add('hidden');
        catSel.innerHTML = cats.length ? '<option value="' + esc(cats[0][0]) + '">' + esc(cats[0][1]) + '</option>' : '<option value=""></option>';
      }
      fillTemplate(catSel.value);
    }
    svcSel.addEventListener('change', function () { pickSvc(svcSel.value, ''); });
    catSel.addEventListener('change', function () { fillTemplate(catSel.value); });
    var p = qs('service');
    if (p === 'rcs') p = 'com';
    if (p && svcOf(p)) pickSvc(p, qs('category'));

    function showErr(m) { var el = $('#err'); el.textContent = m; el.classList.remove('hidden'); el.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
    function fieldErr(el, msg) {
      var f = el.closest('.zd-field');
      f.classList.add('has-error');
      if (!$('.zd-field-err', f)) { var pe = document.createElement('p'); pe.className = 'zd-field-err'; f.appendChild(pe); }
      $('.zd-field-err', f).textContent = msg;
    }
    $('#reqForm').addEventListener('submit', function (e) {
      e.preventDefault();
      $('#err').classList.add('hidden');
      $all('.zd-field.has-error').forEach(function (f) { f.classList.remove('has-error'); var pe = $('.zd-field-err', f); if (pe) pe.remove(); });
      var bad = null;
      function need(el, msg) { if (!bad) bad = el; fieldErr(el, msg); }
      var email = $('#email').value.trim();
      var nick = $('#nickname').value.trim();
      var text = getBody().trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) need($('#email'), '이메일 주소를 확인해 주세요.');
      if (!nick) need($('#nickname'), '닉네임을 입력해 주세요.');
      if (!svcSel.value) need(svcSel, '이용 서비스를 선택해 주세요.');
      else if (!catSel.value) need(catSel, '문의 유형을 선택해 주세요.');
      if (!$('#subject').value.trim()) need($('#subject'), '제목을 입력해 주세요.');
      if (text.length < 5 || text === lastTpl.trim()) need(body, '문의 내용을 입력해 주세요.');
      if (!$('#agree').checked) need($('#agree'), '개인 정보 수집 및 이용에 동의해 주세요.');
      if (bad) { var tgt = bad.closest('.zd-field') || bad; tgt.scrollIntoView({ block: 'center', behavior: 'smooth' }); return; }
      var btn = $('#submitBtn');
      btn.disabled = true; btn.textContent = '제출 중…';
      readFiles(getFiles()).then(function (files) {
        return api('submit', {
          service: svcSel.value, category: catSel.value, name: nick, email: email, fields: { nickname: nick },
          subject: $('#subject').value, body: text, agree: true, website: $('#website').value,
          files: files, ua: navigator.userAgent, page: location.href
        });
      }).then(function (r) {
        $('#reqForm').classList.add('hidden');
        $('.ogq-req-formcard__head').classList.add('hidden');
        $('#doneBox').classList.remove('hidden');
        $('.ogq-req-formcard').scrollIntoView({ behavior: 'smooth', block: 'start' });
      }).catch(function (err) { btn.disabled = false; btn.textContent = '제출'; showErr(err.message); });
    });
  }

  /* ───────── 미리보기용 가짜 서버 (config.js의 API_URL이 'MOCK'일 때) ───────── */
  function mock(action) {
    var data = {
      fields: [{ key: 'nickname', label: '닉네임', type: 'text', options: [], required: true, services: [] }],
      services: [
        { code: 'ocs', name: 'OGQ 크리에이터 스튜디오', categories: [
          { code: 'ocs_서비스', label: '서비스 이용 방법', template: '- 문의 내용(상세): ' },
          { code: 'ocs_승인', label: '콘텐츠 승인 요청', template: '[콘텐츠 승인요청]\n- 크리에이터명:\n- 크리에이터 아이디(이메일):\n- 콘텐츠 명:\n- 문의 내용(상세): ' },
          { code: 'ocs_정산', label: '수익금 정산', template: '[수익금 정산 문의]\n- 크리에이터명:\n- 크리에이터 계정(이메일):\n- 문의 내용(상세): ' },
          { code: 'ocs_기타', label: '기타', template: '' }] },
        { code: 'nom', name: 'NAVER OGQ마켓', categories: [
          { code: 'nom_구매_환불', label: '콘텐츠 구매/환불', template: '- 구매하신 콘텐츠명: \n- 콘텐츠 결제 일시: \n- 결제 수단: \n- 문의 내용(상세): ' },
          { code: 'nom_기타', label: '기타', template: '' }] },
        { code: 'com', name: '채팅+ OGQ마켓', categories: [{ code: 'com_환불', label: '결제/환불', template: '' }, { code: 'com_기타', label: '기타', template: '' }] },
        { code: 'orcs', name: '채팅+ 원스토어', categories: [{ code: 'orcs', label: '채팅+ 원스토어', template: '' }] },
        { code: 'mp', name: '광고&제휴', categories: [{ code: 'mp', label: '광고&제휴', template: '' }] }
      ]
    };
    return new Promise(function (res) {
      setTimeout(function () {
        if (action === 'config') res(data);
        else if (action === 'submit') res({ id: 100001, token: 'mocktoken' });
        else if (action === 'view') res({ id: 100001, subject: '태그 오타 수정 부탁드립니다', status: 'pending', service: 'OGQ 크리에이터 스튜디오', createdAt: Date.now() - 86400000, canReply: true,
          messages: [
            { mine: true, name: '호두코콩', at: Date.now() - 86400000, body: '[수정 요청]\n- 콘텐츠 제목: 강아지 호두\n- 수정 내용: 태그 #강아자 → #강아지', files: ['캡처.png'] },
            { mine: false, name: 'OGQ 고객센터', at: Date.now() - 3600000, body: '안녕하세요, OGQ입니다.\n\n요청하신 태그를 수정했습니다.\n\n감사합니다.', files: [] }] });
        else res({ ok: true, followUp: false });
      }, 250);
    });
  }

  var init = { index: initIndex, article: initArticle, category: initCategory, section: initSection, search: initSearch, request: initRequest }[page];
  if (init) init();
})();
