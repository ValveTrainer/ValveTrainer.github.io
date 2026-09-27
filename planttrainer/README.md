# Plant Trainer v1: free operator training

Plant Trainer is a free, offline-capable web training tool for manufacturing plant **operators** (console and field). It covers pressure and vacuum, DP, reading P&IDs, board readings, pumps, valves, vacuum systems, filtration, whole-system troubleshooting, LOTO, failure modes, instrument sense, control loops, and design intent. There are 14 sections, each with 4–6 short steps and an adaptive Check quiz. It also has a built-in **Plant Mentor** and two practice games.

> **Training support only.** Plant Trainer does not qualify anyone and does not replace your site procedures, P&IDs, permits, or LOTO. All tags (TI-101, FIC-101, PDT-101, …) and numbers are generic examples. None of them are real setpoints.

- Plain HTML + CSS + vanilla JavaScript. No accounts, no backend, no build step, no paid APIs, no external fonts or CDNs.
- Progress is saved in your browser's `localStorage` under the key `plantTrainer.v1`: sections opened, current step, quiz level per section, passed checkmarks, last location, and role. **Reset my progress** is at the bottom of Home.
- Plant Mentor answers from the knowledge base built into `js/content.js`. The **Ask Grok** button makes no network call. It copies a ready-made prompt plus your question to the clipboard, so you can paste it into your own Grok bot.

## Files

```
index.html        page shell (top bar, sidebar, main, Plant Mentor panel, mobile bottom bar)
css/styles.css    dark industrial theme (charcoal / safety amber / process green)
js/content.js     data only: GROUPS, MODULES, ROLES, MENTOR_CHIPS, SVG drawings, STEPS, QUESTIONS, KB
js/app.js         router, progress, adaptive quiz engine, Plant Mentor, practice games, Ask Grok copy
README.md         this file
```

## Open it locally (no internet needed)

1. Download or copy the folder to the computer or phone.
2. Double-click `index.html` (or open it with any modern browser: Chrome, Edge, Safari, Firefox).

That's it. Nothing loads from the internet. On a locked-down plant PC you can also run it from a USB stick or a shared drive.

Optional: to serve it on your own network, from inside the folder run `python3 -m http.server 8080` and open `http://<computer>:8080/`.

## Host it free on GitHub Pages ($0)

1. Create a free GitHub account and a new **public** repository, for example `plant-trainer`.
2. Upload `index.html`, `README.md`, and the `css/` and `js/` folders to the repository root. You can use **Add file → Upload files** in the browser, or `git push`.
3. In the repository, go to **Settings → Pages**. Under **Build and deployment**, choose **Deploy from a branch**, pick `main` and `/ (root)`, then **Save**.
4. After a minute your site is live at `https://<your-username>.github.io/plant-trainer/`.

No build step is needed. Every time you commit a change, Pages republishes it. Each learner's progress stays in their own browser.

## How to add a module

Everything lives in `js/content.js`. You don't need to touch `app.js`.

1. **Add the module** to the `MODULES` array:
   ```js
   { id: 'steam', num: 15, group: 'ops', title: 'Steam and condensate',
     summary: 'One-line summary for the Home card.',
     keywords: ['steam','trap','condensate','hammer'],          // helps Mentor suggest this lesson
     fieldReality: 'One field-reality safety warning.',
     operatorAction: ['Action 1', 'Action 2', 'Action 3'],
     supervise: { coach: 'One coaching question.', stop: 'Stop the job if…' } }
   ```
   `group` is one of `fund`, `ops`, `maint`, `eng` (see `GROUPS`).
2. **Add the section id** to each role's `order` list in `ROLES`, so it appears in "Recommended next."
3. **Add 4–6 steps**:
   ```js
   STEPS.steam = [
     { title: 'Short step title',
       floor: 'Start on the floor: 2–4 sentences, something you can feel.',
       words: 'Plant words. Wrap new terms: <span class="term" data-term="steam-trap">steam trap</span>.',
       pic: '<div class="table-wrap"><table>…</table></div>  or an inline <svg class="fig">…</svg>',
       bite: 'Night-shift bite: a short real-feeling scenario.',
       head: { q: 'Unscored check-your-head question?', a: 'Short answer.' } }
   ];
   ```
4. **Add at least 8 Check questions**. Mix difficulties 1, 2, and 3 (three of each works well). `answer` is the index of the correct choice. Choices are shuffled on screen. `lessonStep` is 1-based.
   ```js
   QUESTIONS.steam = [
     { difficulty: 2, q: 'Question text?', choices: ['Right', 'Wrong', 'Wrong', 'Wrong'], answer: 0,
       explain: 'Why the right answer is right.', lessonStep: 2 }
   ];
   ```
5. **Add a KB entry for every new `data-term` slug**. Start with something you can feel, then give the plant version, in 3–6 sentences:
   ```js
   Object.assign(KB, { 'steam-trap': { title: 'Steam trap', tags: ['trap','steam','condensate'],
     module: 'steam', step: 1, answer: '…', simpler: '…', supervisor: '…' } });
   ```
6. Open `index.html` and click through. The new section appears on Home, in the sidebar, and in Sections.

### Quiz rules (built in)
Each Check has 5 scored questions and starts at your level for that section (2 by default). A right answer makes the next question harder (max 3). A wrong answer shows the explanation right away, offers "Review this idea," and makes the next question easier (min 1). Pass = 4 of 5, which saves a green checkmark and shows the toast "Section complete — support training only." If you fail, the section stays open, your level drops by 1, and you can retry with shuffled answers. Leaving mid-Check doesn't lose your place.

## Privacy
There's no tracking and no analytics, and nothing leaves the device. The only thing stored is your progress in `localStorage`, which you can clear with **Reset my progress**.
