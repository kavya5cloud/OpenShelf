/* Audiobooks — read-along player built on the browser's Web Speech API.
   Text is spoken one sentence at a time, which lets us highlight the current
   sentence, pause/resume reliably, change speed, and remember the position. */
(async function () {
  const me = OS.requireAuth();
  if (!me) return;
  OS.shell('audio');
  const all = await OS.api.listBooks();
  const $ = OS.$, esc = OS.esc;
  const synth = window.speechSynthesis;
  const canSpeak = !!(synth && window.SpeechSynthesisUtterance);
  const books = () => all;
  const ids = Object.keys(OS.AUDIOBOOKS).filter((id) => books().some((b) => b.id === id));
  const split = (text) => text.match(/[^.!?]+[.!?]+/g).map((s) => s.trim());

  const S = { id: null, ch: 0, si: 0, playing: false, rate: 1, voice: null, gen: 0 };
  const PREF = 'openshelf_audio_prefs';
  try { const p = JSON.parse(localStorage.getItem(PREF)) || {}; S.rate = p.rate || 1; S.voiceName = p.voice; } catch (e) { /* ignore */ }
  const savePrefs = () => { try { localStorage.setItem(PREF, JSON.stringify({ rate: S.rate, voice: S.voice && S.voice.name })); } catch (e) { /* ignore */ } };

  $('#prevBtn').innerHTML = OS.icon('back', 20);
  $('#nextBtn').innerHTML = OS.icon('fwd', 20);
  if (!canSpeak) $('#noSpeech').hidden = false;

  // ---------- voices ----------
  function loadVoices() {
    if (!canSpeak) { $('#voice').innerHTML = '<option>Not available</option>'; $('#voice').disabled = true; return; }
    const vs = synth.getVoices().filter((v) => /^en/i.test(v.lang));
    if (!vs.length) { $('#voice').innerHTML = '<option>Default voice</option>'; return; }
    const rank = (v) => (v.lang === 'en-IN' ? 0 : /en-GB/.test(v.lang) ? 1 : /en-US/.test(v.lang) ? 2 : 3);
    vs.sort((a, b) => rank(a) - rank(b));
    S.voice = vs.find((v) => v.name === S.voiceName) || vs[0];
    $('#voice').innerHTML = vs.map((v, i) => `<option value="${i}" ${v === S.voice ? 'selected' : ''}>${esc(v.name)} (${esc(v.lang)})</option>`).join('');
    $('#voice').onchange = () => { S.voice = vs[+$('#voice').value]; savePrefs(); if (S.playing) speak(); };
  }
  if (canSpeak) { loadVoices(); synth.onvoiceschanged = loadVoices; } else loadVoices();

  // ---------- rendering ----------
  const book = () => books().find((b) => b.id === S.id);
  const ab = () => OS.AUDIOBOOKS[S.id];

  function renderLibrary() {
    $('#library').innerHTML = ids.map((id) => {
      const b = books().find((x) => x.id === id);
      const pct = OS.audioProgress.percent(id);
      return `<button type="button" class="audio-card" data-id="${id}" aria-pressed="${id === S.id}">
        ${OS.cover(b, 'lg')}
        <b>${esc(b.title)}</b>
        <small>${OS.audioLength(id)} min · ${pct === 100 ? 'Finished' : pct ? pct + '% listened' : 'Not started'}</small>
        ${pct ? `<span class="progress"><span style="width:${pct}%"></span></span>` : ''}
      </button>`;
    }).join('');
    OS.$$('#library .audio-card').forEach((c) => c.addEventListener('click', () => { location.hash = c.dataset.id; }));
  }

  function renderPlayer() {
    const b = book(), a = ab();
    const chapter = a.chapters[S.ch];
    $('#npCover').innerHTML = OS.cover(b, 'xl');
    $('#npTitle').textContent = b.title;
    $('#npAuthor').textContent = b.author;
    const left = a.chapters.slice(S.ch).reduce((s, c, i) => s + split(c.text).slice(i === 0 ? S.si : 0).join(' ').split(/\s+/).length, 0);
    $('#npInfo').textContent = `Chapter ${S.ch + 1} of ${a.chapters.length} · about ${Math.max(1, Math.round(left / 150 / S.rate))} min left · ${a.narrator}`;
    const sents = split(chapter.text);
    const pct = Math.round(((S.ch + S.si / sents.length) / a.chapters.length) * 100);
    $('#npBar').style.width = pct + '%';
    $('#chTitle').textContent = `${S.ch + 1}. ${chapter.title}`;
    $('#readAlong').innerHTML = sents.map((s, i) => `<span class="s ${i === S.si && (S.playing || S.si > 0) ? 'on' : ''}" data-i="${i}">${esc(s)}</span>`).join(' ');
    OS.$$('#readAlong .s').forEach((el) => el.addEventListener('click', () => { S.si = +el.dataset.i; save(); if (S.playing) speak(); else renderPlayer(); }));
    const on = $('#readAlong .s.on');
    if (on) { const box = $('#readAlong'); box.scrollTop = Math.max(0, on.offsetTop - box.offsetTop - 40); }
    $('#chapters').innerHTML = a.chapters.map((c, i) => `
      <button type="button" class="chapter" data-ch="${i}" aria-current="${i === S.ch}"><span class="n">${i + 1}</span>${esc(c.title)}<span class="d">${OS.audioMinutes(c.text)} min</span></button>`).join('');
    OS.$$('#chapters .chapter').forEach((el) => el.addEventListener('click', () => goChapter(+el.dataset.ch, true)));
    $('#playBtn').innerHTML = OS.icon(S.playing ? 'pause' : 'play', 26);
    $('#playBtn').setAttribute('aria-label', S.playing ? 'Pause' : 'Play');
    $('#playBtn').disabled = !canSpeak;
    $('#prevBtn').disabled = S.ch === 0 && S.si === 0;
    $('#nextBtn').disabled = S.ch >= a.chapters.length - 1;
    $('#player').classList.toggle('playing', S.playing);
    $('#npState').textContent = S.playing ? 'Playing' : (OS.audioProgress.percent(S.id) === 100 ? 'Finished' : S.ch || S.si ? 'Paused' : 'Ready to play');
    OS.$$('#speeds button').forEach((x) => x.setAttribute('aria-pressed', String(+x.dataset.r === S.rate)));
  }

  // ---------- speech engine ----------
  function save(done = false) { OS.audioProgress.set(S.id, S.ch, S.si, done); }

  function speak() {
    if (!canSpeak) return;
    const gen = ++S.gen;
    synth.cancel();
    const sents = split(ab().chapters[S.ch].text);
    const u = new SpeechSynthesisUtterance((S.si === 0 ? ab().chapters[S.ch].title + '. ' : '') + sents[S.si]);
    u.rate = S.rate;
    if (S.voice) u.voice = S.voice;
    u.lang = S.voice ? S.voice.lang : 'en-IN';
    u.onend = () => { if (gen === S.gen && S.playing) advance(); };
    u.onerror = (e) => { if (gen === S.gen && e.error !== 'interrupted' && e.error !== 'canceled') { S.playing = false; renderPlayer(); OS.toast(e.error === 'synthesis-failed' || e.error === 'voice-unavailable' ? 'No speech voice is available on this device. Try Chrome or Edge.' : 'Speech stopped: ' + e.error, 'error'); } };
    renderPlayer();
    // tiny delay avoids a Chrome bug where speak() right after cancel() is dropped
    setTimeout(() => { if (gen === S.gen) synth.speak(u); }, 60);
  }

  function advance() {
    const a = ab();
    const n = split(a.chapters[S.ch].text).length;
    if (S.si < n - 1) { S.si++; }
    else if (S.ch < a.chapters.length - 1) { S.ch++; S.si = 0; }
    else { // finished the book
      S.playing = false; S.ch = 0; S.si = 0; save(true);
      renderPlayer(); renderLibrary();
      OS.toast(`Finished "${book().title}". Nice!`, 'success');
      return;
    }
    save();
    speak();
    if (S.si === 0) renderLibrary();
  }

  function play() { S.playing = true; save(); speak(); renderLibrary(); }
  function pause() { S.playing = false; S.gen++; if (canSpeak) synth.cancel(); save(); renderPlayer(); renderLibrary(); }
  function goChapter(i, autoplay) {
    S.ch = Math.max(0, Math.min(ab().chapters.length - 1, i)); S.si = 0; save();
    if (S.playing || autoplay) { S.playing = true; speak(); } else renderPlayer();
    renderLibrary();
  }

  $('#playBtn').addEventListener('click', () => (S.playing ? pause() : play()));
  $('#nextBtn').addEventListener('click', () => goChapter(S.ch + 1));
  $('#prevBtn').addEventListener('click', () => goChapter(S.si > 0 ? S.ch : S.ch - 1));
  OS.$$('#speeds button').forEach((b) => b.addEventListener('click', () => { S.rate = +b.dataset.r; savePrefs(); if (S.playing) speak(); else renderPlayer(); }));
  window.addEventListener('pagehide', () => { if (canSpeak) synth.cancel(); });

  // ---------- choose book from #hash, else last played, else first ----------
  function open(id) {
    if (!OS.AUDIOBOOKS[id] || !books().some((b) => b.id === id)) return false;
    if (S.playing) pause();
    S.id = id;
    const p = OS.audioProgress.get().books[id];
    S.ch = p && !p.done ? p.chapter : 0;
    S.si = p && !p.done ? p.sentence : 0;
    renderPlayer(); renderLibrary();
    return true;
  }
  window.addEventListener('hashchange', () => { open(location.hash.slice(1)); $('#player').scrollIntoView({ behavior: 'smooth', block: 'start' }); });
  const last = OS.audioProgress.get().last;
  open(location.hash.slice(1)) || open(last) || open(ids[0]);
})();
