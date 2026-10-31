/* OpenShelf — audiobook summaries
   ---------------------------------------------------------------
   Short, chapter-wise summaries that the read-along player speaks out loud,
   plus the listening progress each reader builds up. The player itself lives
   in js/pages/audiobooks.js; this file is only data and bookkeeping, and every
   page loads it so the sidebar can show a "Continue listening" card.

   To add a book, add an entry keyed by its book id (see js/store.js). Keep the
   sentences short and always end them with . ! or ? — the player splits on
   that punctuation to highlight one sentence at a time.
*/
window.OS = window.OS || {};

(function (OS) {
  OS.AUDIOBOOKS = {
    'BK-017': {
      narrator: 'OpenShelf Reader',
      chapters: [
        { title: 'Small habits, big results', text: 'Habits are the compound interest of self improvement. A single push up changes nothing today, yet repeated for a year it rebuilds the body. Progress feels invisible for a long time, because results arrive later than the effort. Most people quit in that quiet stretch, just before the gains show. Aim at the system you follow every day rather than the goal you picture.' },
        { title: 'Make it obvious', text: 'A habit begins with a cue your environment hands you. Leave the book on the pillow and reading becomes the easy option. Hide the phone in another room and scrolling becomes the hard one. Write down when and where the habit will happen, so the decision is already made. Design the room and the room will design the behaviour.' },
        { title: 'Make it attractive and easy', text: 'We repeat what feels rewarding, so pair the habit with something you enjoy. Listen to a summary while you walk and the walk pulls the listening along. Then shrink the habit until it takes two minutes. Read one page, write one line, solve one problem. A habit you can start is a habit you can keep.' },
        { title: 'Make it satisfying', text: 'What gets rewarded gets repeated, and what gets measured gets rewarded. Tick a box, keep a streak, mark the calendar. Never miss twice, because one slip is an accident and two is a new pattern. Identity does the rest. You are not trying to read more, you are becoming a reader.' }
      ]
    },
    'BK-018': {
      narrator: 'OpenShelf Reader',
      chapters: [
        { title: 'No one is crazy', text: 'Your view of money is shaped by the world you grew up in. Someone raised through high inflation treats saving differently from someone raised in a long boom. Both have lived evidence for what they believe. So financial arguments are rarely about arithmetic. They are about different experiences wearing the same words.' },
        { title: 'Luck and risk', text: 'Every outcome is part effort and part accident. The same decision can look brilliant or reckless depending on how the dice fell. Study failure for lessons and study success with suspicion. Judge the process, because the process is the part you control. Leave room for the part you do not.' },
        { title: 'Enough', text: 'The hardest financial skill is stopping the goalpost from moving. Comparison has no finish line, and the race upward is one you can never win. Many people risk what they need to gain what they merely want. Knowing what counts as enough protects everything you already have. Reputation, freedom and sleep are not worth gambling for a larger number.' },
        { title: 'Time and tails', text: 'Compounding is quiet and then it is enormous, which is why time matters more than returns. A long runway beats a clever year. Meanwhile a few decisions carry most of the result, so expect many ordinary outcomes and a handful of extraordinary ones. Wealth is what you do not spend. Saving is the gap between your ego and your income.' }
      ]
    },
    'BK-016': {
      narrator: 'OpenShelf Reader',
      chapters: [
        { title: 'Rameswaram', text: 'Kalam grew up in a small island town in Tamil Nadu, in a house where little was spare and nothing was wasted. His father ferried pilgrims and taught by example rather than by lecture. Neighbours of different faiths shared festivals and grief alike. A teacher who refused to seat boys apart by caste left a mark he carried for life. He learned early that dignity costs nothing to give.' },
        { title: 'Learning to fly', text: 'He studied physics, then aeronautical engineering in Madras, often on scholarships and always on a budget. A design deadline he nearly missed taught him that engineering is a promise kept on time. He missed selection as an air force pilot by one place. The disappointment was real, and it redirected him rather than stopping him. Rockets, it turned out, were waiting.' },
        { title: 'Building rockets', text: 'At ISRO he worked on the SLV project that put a satellite into orbit from Indian soil. The first launch failed and the failure was owned publicly by his leaders, not pushed onto the team. That lesson in shared responsibility shaped how he ran projects afterwards. The second launch succeeded. He credits the people far more than the machines.' },
        { title: 'Wings of fire', text: 'Later he led missile development, where many small teams had to trust one another completely. He argues that a nation grows when its young people are allowed to dream in technical detail. Work was worship, and failure was simply data arriving early. He asks readers to carry their own wings of fire. The sky, he insists, is not the limit but the beginning.' }
      ]
    },
    'BK-008': {
      narrator: 'OpenShelf Reader',
      chapters: [
        { title: 'Clean code matters', text: 'Code is read far more often than it is written, so clarity is a feature. Mess slows every change that follows and the slowdown compounds. The only way to go fast later is to stay clean now. Craftsmanship here means leaving the file better than you found it. Professionals are measured by the code they hand over.' },
        { title: 'Names and functions', text: 'A good name answers why something exists, not just what it holds. If a name needs a comment to explain it, rename it. Functions should be small, do one thing, and sit at a single level of abstraction. Few arguments, no hidden side effects, no flag parameters. When a function is hard to name, it is usually doing too much.' },
        { title: 'Comments and formatting', text: 'Comments do not redeem bad code, they apologise for it. Prefer expressing intent in the code itself and keep comments for the why that code cannot carry. Consistent formatting is courtesy to the next reader. Keep related things close and unrelated things apart. A file should read top to bottom like a newspaper.' },
        { title: 'Tests and smells', text: 'Tests keep a codebase changeable, so they deserve the same care as production code. Keep them fast, independent, repeatable and readable, one assertion idea at a time. Duplication, long parameter lists and dead code are smells, not crimes. Refactor in small steps with the tests green. Clean code is a habit, not a cleanup project.' }
      ]
    }
  };

  // Spoken length at roughly 150 words a minute.
  OS.audioMinutes = function (text) {
    return Math.max(1, Math.round(String(text).trim().split(/\s+/).length / 150));
  };

  OS.audioLength = function (id) {
    const ab = OS.AUDIOBOOKS[id];
    if (!ab) return 0;
    const words = ab.chapters.reduce((n, c) => n + c.text.trim().split(/\s+/).length, 0);
    return Math.max(1, Math.round(words / 150));
  };

  // ---- listening progress (per browser, like the rest of the demo) ----
  const KEY = 'openshelf_audio_progress';
  const empty = () => ({ last: null, books: {} });

  function read() {
    try {
      const p = JSON.parse(localStorage.getItem(KEY));
      if (p && p.books) return p;
    } catch (e) { /* ignore */ }
    return empty();
  }

  function write(p) {
    try { localStorage.setItem(KEY, JSON.stringify(p)); } catch (e) { /* storage full or blocked */ }
  }

  OS.audioProgress = {
    get: read,

    set(id, chapter, sentence, done) {
      if (!id) return;
      const p = read();
      p.last = id;
      p.books[id] = { chapter: chapter || 0, sentence: sentence || 0, done: !!done, at: Date.now() };
      write(p);
    },

    // How far through the book, as a whole percentage.
    percent(id) {
      const ab = OS.AUDIOBOOKS[id];
      const p = read().books[id];
      if (!ab || !p) return 0;
      if (p.done) return 100;
      const sents = ab.chapters[p.chapter] ? ab.chapters[p.chapter].text.match(/[^.!?]+[.!?]+/g).length : 1;
      return Math.round(((p.chapter + p.sentence / sents) / ab.chapters.length) * 100);
    },

    reset() { write(empty()); }
  };
})(window.OS);
