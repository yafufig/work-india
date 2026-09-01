/* ============================================================
   Первая зарплата (First Salary) — движение
   1. Оркестрованный вход первого экрана
   2. Раскрытие по скроллу (IntersectionObserver)
   3. Живой прототип: сценарная машина времени
   Всё анимируется только transform/opacity.
   При prefers-reduced-motion: reduce движение выключается,
   сцены показывают финальный кадр.
   ============================================================ */
(function () {
  'use strict';

  var RM = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
  // ?rm=1 — принудительная проверка режима без движения
  var FORCED = /[?&]rm=1/.test(location.search);
  var reduced = function () { return RM.matches || FORCED; };

  /* ---------- 1. Вход первого экрана ---------- */
  function orchestrate() {
    var items = document.querySelectorAll('[data-enter]');
    if (!items.length) return;
    if (reduced()) {
      for (var i = 0; i < items.length; i++) items[i].classList.add('in');
      document.documentElement.classList.add('wi-entered');
      return;
    }
    // Сначала даём браузеру отрисовать исходные позиции, и только затем
    // запускаем каскад. Через таймер тоже — в фоновой вкладке rAF не идёт,
    // и без страховки первый экран остался бы невидимым.
    var fired = false;
    var go = function () {
      if (fired) return;
      fired = true;
      for (var i = 0; i < items.length; i++) {
        items[i].style.transitionDelay = (parseFloat(items[i].getAttribute('data-enter')) || 0) + 'ms';
        items[i].classList.add('in');
      }
      document.documentElement.classList.add('wi-entered');
    };
    requestAnimationFrame(function () { requestAnimationFrame(go); });
    setTimeout(go, 140);
  }

  /* ---------- 2. Раскрытие по скроллу ---------- */
  function revealOnScroll() {
    var nodes = document.querySelectorAll('[data-reveal]');
    if (!nodes.length) return;
    if (reduced() || !('IntersectionObserver' in window)) {
      for (var i = 0; i < nodes.length; i++) {
        // у каскадных сеток дети прячутся отдельно — их тоже надо показать
        if (nodes[i].getAttribute('data-reveal') === 'stagger') {
          for (var c = 0; c < nodes[i].children.length; c++) nodes[i].children[c].classList.add('in');
        }
        nodes[i].classList.add('in');
      }
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        var el = e.target;
        var group = el.getAttribute('data-reveal');
        if (group === 'stagger') {
          var kids = el.children, k = 0;
          for (var j = 0; j < kids.length; j++) {
            kids[j].style.transitionDelay = (k++ * 70) + 'ms';
            kids[j].classList.add('in');
          }
        }
        el.classList.add('in');
        io.unobserve(el);
      });
    }, { rootMargin: '0px 0px -12% 0px', threshold: 0.12 });
    for (var n = 0; n < nodes.length; n++) io.observe(nodes[n]);
    // Страховка: если IntersectionObserver не сработал (фоновая вкладка,
    // переход по якорю), досматриваем видимое сами.
    var sweep = function () {
      for (var m = 0; m < nodes.length; m++) {
        var el = nodes[m];
        if (el.classList.contains('in')) continue;
        if (el.getBoundingClientRect().top < window.innerHeight + 40) {
          if (el.getAttribute('data-reveal') === 'stagger') {
            for (var j = 0; j < el.children.length; j++) el.children[j].classList.add('in');
          }
          el.classList.add('in');
        }
      }
    };
    setTimeout(sweep, 1200);
    var ticking = false;
    window.addEventListener('scroll', function () {
      if (ticking) return;
      ticking = true;
      setTimeout(function () { ticking = false; sweep(); }, 200);
    }, { passive: true });
    window.wiRevealAll = function () {
      for (var m = 0; m < nodes.length; m++) {
        var el = nodes[m];
        if (el.getAttribute('data-reveal') === 'stagger') {
          for (var j = 0; j < el.children.length; j++) el.children[j].classList.add('in');
        }
        el.classList.add('in');
      }
    };
  }

  /* ---------- 3. Сценарная машина ----------
     Разметка:
       [data-scene]              — корень сцены
         [data-act][data-dur]    — акт, длительность в мс
           data-phases="0:shot,900:scan,3200:focus"
           [data-at="1200"]      — элемент включается на 1200 мс
             [data-out="9000"]   — и выключается на 9000 мс
           [data-type]           — печатается посимвольно, data-cps скорость
     Движок задаёт act.dataset.phase, остальное делает CSS.
  ------------------------------------------------------------ */

  /* Печать «по словам»: настоящие модели стримят токенами, а посимвольный
     вывод и выглядит иначе, и перекладывает строку на каждом кадре.
     Слова заранее разбиты на span-ы, поэтому ширина строки не меняется. */
  function splitWords(el) {
    if (el._words) return el._words;
    var words = [];
    var walk = function (node) {
      Array.prototype.slice.call(node.childNodes).forEach(function (n) {
        if (n.nodeType === 3) {
          var parts = n.nodeValue.split(/(\s+)/);
          if (!parts.length) return;
          var frag = document.createDocumentFragment();
          parts.forEach(function (t) {
            if (!t) return;
            if (/^\s+$/.test(t)) { frag.appendChild(document.createTextNode(t)); return; }
            var w = document.createElement('span');
            w.className = 'w';
            w.textContent = t;
            frag.appendChild(w);
            words.push(w);
          });
          node.replaceChild(frag, n);
        } else if (n.nodeType === 1) walk(n);
      });
    };
    walk(el);
    // Кумулятивные времена появления: 42 мс на слово + детерминированный
    // разброс ±6 мс, чтобы поток не звучал как метроном.
    var t = 0, times = [];
    for (var i = 0; i < words.length; i++) {
      times.push(t);
      var jitter = ((i * 2654435761) % 13) - 6;
      t += 42 + jitter + (words[i].textContent.length > 9 ? 22 : 0);
    }
    el._words = words;
    el._times = times;
    el._shown = -1;
    return words;
  }

  function applyType(el, elapsed) {
    var words = splitWords(el);
    var at = parseFloat(el.getAttribute('data-at')) || 0;
    var local = elapsed - at;
    var n = 0;
    while (n < words.length && el._times[n] <= local) n++;
    if (n === el._shown) return;
    var lo = el._shown < 0 ? 0 : Math.min(el._shown, n);
    var hi = el._shown < 0 ? words.length : Math.max(el._shown, n);
    for (var i = lo; i < hi; i++) words[i].classList.toggle('on', i < n);
    el._shown = n;
    el.classList.toggle('typing', n > 0 && n < words.length);
  }

  function setupAct(act) {
    // порядковый номер клетки — для каскадного появления
    Array.prototype.forEach.call(act.querySelectorAll('.cells'), function (row) {
      Array.prototype.forEach.call(row.children, function (c, i) { c.style.setProperty('--i', i); });
    });
    var raw = act.getAttribute('data-phases') || '';
    act._phases = raw.split(',').filter(Boolean).map(function (p) {
      var kv = p.split(':');
      return { t: parseFloat(kv[0]), name: kv[1] };
    }).sort(function (a, b) { return a.t - b.t; });
    act._timed = Array.prototype.slice.call(act.querySelectorAll('[data-at]'));
    act._typed = Array.prototype.slice.call(act.querySelectorAll('[data-type]'));
    act._typed.forEach(splitWords);
    act._dur = parseFloat(act.getAttribute('data-dur')) || 11000;
    act._pause = parseFloat(act.getAttribute('data-pause-ms')) || 900;
  }

  function renderAct(act, elapsed) {
    var ph = '';
    for (var i = 0; i < act._phases.length; i++) {
      if (elapsed >= act._phases[i].t) ph = act._phases[i].name;
    }
    if (act.dataset.phase !== ph) act.dataset.phase = ph;
    act._timed.forEach(function (el) {
      var at = parseFloat(el.getAttribute('data-at')) || 0;
      var out = el.getAttribute('data-out');
      var on = elapsed >= at && (out === null || elapsed < parseFloat(out));
      if (el._on !== on) { el.classList.toggle('on', on); el._on = on; }
    });
    act._typed.forEach(function (el) { applyType(el, elapsed); });
  }

  function Scene(root) {
    var acts = Array.prototype.slice.call(root.querySelectorAll('[data-act]'));
    if (!acts.length) return;
    acts.forEach(setupAct);

    var idx = 0, t0 = 0, paused = false, rafId = 0, started = false;
    var rail = root.querySelector('[data-rail]');
    var chips = rail ? Array.prototype.slice.call(rail.querySelectorAll('[data-jump]')) : [];
    var bars = chips.map(function (c) { return c.querySelector('.rail-fill'); });
    var pauseBtn = root.querySelector('[data-pause]');

    function showAct(i) {
      acts.forEach(function (a, k) { a.classList.toggle('live', k === i); });
      chips.forEach(function (c, k) {
        c.classList.toggle('now', k === i);
        c.setAttribute('aria-current', k === i ? 'true' : 'false');
      });
      bars.forEach(function (b, k) { if (b) b.style.transform = 'scaleX(' + (k < i ? 1 : 0) + ')'; });
    }

    function goto(i, resume) {
      idx = ((i % acts.length) + acts.length) % acts.length;
      t0 = performance.now();
      lastPaint = 0;
      acts.forEach(function (a) {
        a._timed.forEach(function (el) { el.classList.remove('on'); el._on = false; });
        a._typed.forEach(function (el) {
          if (el._words) el._words.forEach(function (w) { w.classList.remove('on'); });
          el._shown = -1; el.classList.remove('typing');
        });
        a.dataset.phase = '';
      });
      showAct(idx);
      renderAct(acts[idx], 0);
      if (resume) { paused = false; syncPause(); }
    }

    // rAF крутится на частоте экрана, но DOM трогаем 24 раза в секунду:
    // интерполяцию всё равно делают CSS-переходы.
    var FPS = 24, lastPaint = 0, lastElapsed = 0;
    function frame(now) {
      rafId = requestAnimationFrame(frame);
      if (paused) { t0 = now - lastElapsed; return; }
      var act = acts[idx];
      var elapsed = now - t0;
      lastElapsed = elapsed;
      // финальный кадр держится ещё act._pause мс — без этой точки
      // цикл читается как бесконечная нервная петля
      if (elapsed >= act._dur + act._pause) { goto(idx + 1); return; }
      if (now - lastPaint < 1000 / FPS) return;
      lastPaint = now;
      renderAct(act, Math.min(elapsed, act._dur));
      if (bars[idx]) bars[idx].style.transform = 'scaleX(' + Math.min(1, elapsed / act._dur).toFixed(3) + ')';
    }

    function syncPause() {
      if (!pauseBtn) return;
      pauseBtn.setAttribute('aria-pressed', paused ? 'true' : 'false');
      pauseBtn.setAttribute('aria-label', paused ? 'Продолжить показ' : 'Остановить показ');
      root.classList.toggle('is-paused', paused);
    }

    // финальный кадр без движения
    if (reduced()) {
      acts.forEach(function (a, k) {
        a.classList.toggle('live', k === 0);
        a._timed.forEach(function (el) { el.classList.add('on'); });
        a._typed.forEach(function (el) {
          if (el._words) el._words.forEach(function (w) { w.classList.add('on'); });
        });
        a.dataset.phase = 'rest';
      });
      root.classList.add('is-static');
      chips.forEach(function (c, k) {
        c.classList.toggle('now', k === 0);
        c.addEventListener('click', function () {
          acts.forEach(function (a, j) { a.classList.toggle('live', j === k); });
          chips.forEach(function (cc, j) { cc.classList.toggle('now', j === k); });
        });
      });
      if (pauseBtn) pauseBtn.hidden = true;
      return;
    }

    chips.forEach(function (c, k) {
      c.addEventListener('click', function () { goto(k, true); });
    });
    if (pauseBtn) {
      pauseBtn.addEventListener('click', function () { paused = !paused; syncPause(); });
      syncPause();
    }

    // Отладочная заморозка кадра: ?wi=<акт>:<мс> — чтобы снимать
    // конкретный момент сценария, а не то, что успел поймать скриншот.
    var fz = /[?&]wi=(\d+):(\d+)/.exec(location.search);
    if (fz) {
      goto(+fz[1]);
      renderAct(acts[idx], +fz[2]);
      setTimeout(function () { renderAct(acts[idx], +fz[2]); }, 60);
      root.classList.add('is-frozen');
      return;
    }

    // Сцена работает только когда видна — не жжём кадры за экраном.
    function start() {
      if (started) return;
      started = true;
      goto(0);
      rafId = requestAnimationFrame(frame);
    }
    function stop() {
      if (!started) return;
      started = false;
      cancelAnimationFrame(rafId);
    }
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (es) {
        es.forEach(function (e) { e.isIntersecting ? start() : stop(); });
      }, { threshold: 0.15 }).observe(root);
    } else start();

    document.addEventListener('visibilitychange', function () {
      if (document.hidden) stop(); else if (root.getBoundingClientRect().top < innerHeight) start();
    });
  }

  function scenes() {
    var roots = document.querySelectorAll('[data-scene]');
    for (var i = 0; i < roots.length; i++) Scene(roots[i]);
  }

  /* ---------- 4. Разворачивающийся таймлайн (анкета) ---------- */
  function timeline() {
    var items = document.querySelectorAll('[data-week]');
    if (!items.length) return;
    Array.prototype.forEach.call(items, function (li) {
      var btn = li.querySelector('.wk-toggle');
      if (!btn) return;
      btn.addEventListener('click', function () {
        var open = li.classList.toggle('open');
        btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      });
    });
    var all = document.querySelector('[data-week-all]');
    if (all) {
      all.addEventListener('click', function () {
        var open = all.getAttribute('aria-pressed') !== 'true';
        all.setAttribute('aria-pressed', open ? 'true' : 'false');
        all.textContent = open ? 'Свернуть все недели' : 'Развернуть все недели';
        Array.prototype.forEach.call(items, function (li) {
          li.classList.toggle('open', open);
          var b = li.querySelector('.wk-toggle');
          if (b) b.setAttribute('aria-expanded', open ? 'true' : 'false');
        });
      });
    }
  }

  /* ---------- 5. Интерактивный список функций на LLM ---------- */
  function llmList() {
    var root = document.querySelector('[data-llm]');
    if (!root) return;
    var rows = Array.prototype.slice.call(root.querySelectorAll('.llm-row'));
    if (!rows.length) return;
    function open(i) {
      rows.forEach(function (r, k) {
        var on = k === i;
        r.classList.toggle('open', on);
        var b = r.querySelector('.llm-head');
        if (b) b.setAttribute('aria-expanded', on ? 'true' : 'false');
      });
    }
    rows.forEach(function (r, i) {
      var head = r.querySelector('.llm-head');
      if (!head) return;
      head.addEventListener('click', function () {
        open(r.classList.contains('open') ? -1 : i);
      });
    });
    open(0);
  }

  /* ---------- 6. Тема ---------- */
  function theme() {
    var btn = document.getElementById('themeBtn');
    if (!btn) return;
    function current() {
      var t = document.documentElement.getAttribute('data-theme');
      if (t === 'dark' || t === 'light') return t;
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    btn.addEventListener('click', function () {
      var next = current() === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      try { localStorage.setItem('wi-theme', next); } catch (e) { }
      btn.setAttribute('aria-label', next === 'dark' ? 'Включить светлую тему' : 'Включить тёмную тему');
    });
  }

  /* ---------- 7. Активный раздел в шапке ---------- */
  function navSpy() {
    var links = Array.prototype.slice.call(document.querySelectorAll('.topnav a[href^="#"]'));
    if (!links.length || !('IntersectionObserver' in window)) return;
    var map = {};
    links.forEach(function (a) {
      var s = document.querySelector(a.getAttribute('href'));
      if (s) map[s.id] = a;
    });
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (e.isIntersecting) {
          links.forEach(function (a) { a.classList.remove('here'); });
          if (map[e.target.id]) map[e.target.id].classList.add('here');
        }
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    Object.keys(map).forEach(function (id) { io.observe(document.getElementById(id)); });
  }

  function boot() {
    theme();
    orchestrate();
    revealOnScroll();
    scenes();
    timeline();
    llmList();
    navSpy();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
