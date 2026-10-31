# Ilja Safronovs

![Iļja Safronovs](https://ilyaeis.github.io/assets/photo/headshot.jpg)

R&D Engineer — 3D reconstruction & computer vision · Giraffe360 · Riga, Latvia

ilya.safronos@gmail.com · [GitHub](https://github.com/ilyaeis) · [LinkedIn](https://www.linkedin.com/in/i%C4%BCja-safronovs-eis)

I work on 3D reconstruction and computer vision: Gaussian splatting pipelines, benchmarking systems that measure every change, and continuous research that turns the best new papers into production code. Financial Engineering student at RTU.

## Experience

### Giraffe360 — R&D Engineer

Riga · 2025 – present. Giraffe360 makes cameras and software for real-estate virtual tours.

- **Solved blurry windows and mirrors in sparse-panorama 3DGS.** [Giraffe360 post](https://www.instagram.com/p/DZsNRB8o772/)
  This was a long-standing quality problem. I found the root cause (wrong depth behind windows and walls), handled depth differently inside and outside the room, and added a training-time correction. 700+ controlled experiments back it. It runs in production and was publicly showcased by Giraffe360.
- **Shipped the looped drone video, from idea to production.** [Giraffe360 post](https://www.instagram.com/giraffe360/reel/Dd9ODBVIHhE/)
  I proposed the feature, agreed its look with the designers, developed the camera-path algorithm and shipped it to production. A customer-requested feature, launched by Giraffe360 in Oct 2026.
- **Led the team that built outdoor splats and orbital videos.**
  Led the team that built exterior (outdoor) splats and the orbital outdoor videos, now in production.
- **Research to production: influence accumulation, plus Analytic-Splatting in gsplat.**
  Influence accumulation measures each Gaussian’s contribution to the image and relocates the least useful ones during training; it is in production. Analytic-Splatting (exact per-pixel Gaussian integration) is implemented in gsplat at CUDA level. It reduces aliasing and is used in a downsampling algorithm.
- **Built tools to measure 3DGS quality against known ground truth.**
  Validation tools and ground-truth datasets, to measure quality against known truth; an experiment runner for agent-driven research loops on local GPUs; ClearML GPU runs.

More about this role:

- **Mentored a junior engineer on a new depth algorithm.**
  The junior engineer built a new depth algorithm with me (mostly his work): minima matching plus OMNI-DC to densify LiDAR depth. Now the best method; the team uses it.
- **Led the pipeline restructuring and created a 3DGS monorepo.**
  Led the pipeline restructuring and created a monorepo for all 3DGS extensions and client apps: ~3000-line files split, duplication removed, defects fixed. Enabled the half-floor camera fix.
- **Built an embeddable Rust/wgpu splat viewer and a comparison tool.**
  Embeddable Rust/wgpu splat viewer (host control, PLY comparison); multi-view comparison tool.
- **Prototyped mirror planes and a fly-in dollhouse video intro.**
  Working prototypes: mirror planes with correct reflections; a fly-in “dollhouse” video intro.
- **Worked on mesh generation and point-count reduction for viewers.**
  Mesh generation from splats, combined with Gaussian splats; point-count reduction for viewers.
- **Made diffusion-based artifact fixing runnable on shared GPUs.**
  Diffusion-based artifact fixing (Difix, NVIDIA Fixer) made runnable on shared GPUs.
- **Three hackathon ideas recognized; the looped drone shipped.**
  3 ideas recognized at an internal hackathon (top 20, 2 mentions); the looped drone became a shipped feature.
- **Built an MCP server for the team task board.**
  An MCP server so AI agents can read and write the team task board (Node.js).
- **Earlier: a small LLM service that wrote tour narration.**
  Jul–Oct 2025: a small LLM service that wrote tour narration (OpenAI API, AWS, S3).

## Education

### Riga Technical University — Professional Bachelor, Financial Engineering

2024 – 2028 (expected)

- **Maths, statistics and programming applied to finance.**
  Qualification: senior data analysis specialist. Maths, statistics and programming applied to finance.
  Coursework: mathematical analysis and algebra, probability and statistics, econometrics, time-series analysis, stochastic analysis, Monte Carlo methods, portfolio analysis, actuarial mathematics, data structures and algorithms, databases/SQL, computer networks, programming (Java, C++).

### AI Talent Program (Ponder)

Nov 2024 – Jan 2025 · Mākslīgā intelekta talantu programma

- **Selective program in C++, Python, maths and AI.**
  Selective program: C++, Python, maths and AI development with industry mentors. Led to the Giraffe360 role.

### Riga State Classical Gymnasium — Programming and Mathematics track

Rīgas Valsts klasiskā ģimnāzija

- **State mathematics olympiads and the Small Mathematics University.**
  Specialised track in programming and mathematics (today named “Programming + AI”). Latvian state mathematics olympiads; completed the Small Mathematics University (Mazā matemātikas universitāte) at the University of Latvia.

## Projects

- **load-balancing-experiments — seven experiments on DNS, queueing and load balancing.** [code](https://github.com/ilyaeis/load-balancing-experiments)
  (2026, Python) Seven reproducible experiments for an RTU networks project: DNS round robin and anycast measured from Riga, a queueing simulation of load-balancing policies (“power of two choices”), consistent / rendezvous / Maglev hashing, a mini load balancer with health checks, packet capture.
- **flow — offline workout tracker in Dart/Flutter, in daily use.**
  (2026, Dart/Flutter, private) Log sets with live timers; analysis of volume, load (ACWR), records and body measurements; custom formulas, JSON/CSV/PDF export, CI with golden-image tests. In daily use.
- **monte-carlo-finance — option pricing, volatility and risk models in Python.** [code](https://github.com/ilyaeis/monte-carlo-finance)
  (2026, Python) Monte Carlo option pricing with variance reduction (up to 1,900x), GARCH volatility, VaR backtests with the Kupiec test, efficient frontier from 30,000 portfolios and CAPM; a study project from RTU courses.
- **Portfolio journey — this tap-driven WebGL site in three.js.** [code](./)
  (2025–26, three.js) A tap-driven WebGL world: RK4-integrated strange attractors, a single-stroke vector font, bloom, one continuous comet trail. No build step.
- **Offline Graphing Calculator — 4th place of 27 in a school competition.**
  (2023, with Iļja Volinskis) Graphing calculator that works offline; 4th place of 27 entries in the Riga Business School (RTU) programming competition for secondary school students (10 Jun 2023).

More projects:

- **crypto-quant-lab — 59 backtested trading-rule versions on 6 coins.** [code](https://github.com/ilyaeis/crypto-quant-lab)
  (2026, Python) 59 backtested versions of drift and volatility-targeting rules on 6 coins with a 1% fee. The source was recovered from Python 3.12 bytecode, and all 153 functions were verified.
- **projects_with_NEAT — neuroevolution agents that learn Flappy Bird and Pong.** [code](https://github.com/ilyaeis/projects_with_NEAT)
  (2025, Python) Neuroevolution (NEAT) agents that learn Flappy Bird and Pong; a documented attempt at multi-snake survival.
- **RTU_program_parser — finds extra RTU lectures that fit your schedule.** [code](https://github.com/ilyaeis/RTU_program_parser)
  (2025, Python/Selenium/pandas, with Aleksejs Peņkovs) Scrapes the RTU timetable and finds extra lectures that fit a student’s own schedule; exports to Excel.
- **Snake + maze generator — maze generation, terrain and path-finding in Pygame.** [code](https://github.com/ilyaeis/Snake_plus_Maze_Path_algorithm_gen_2)
  (2024–25, Python/Pygame) DFS maze generation, dynamic terrain (lava, forest, rivers), BFS path-finding.
- **bezier-curve-js — interactive Bezier-curve drawing tool.** [code](https://github.com/ilyaeis/bezier-curve-js)
  (2023, JavaScript) Interactive Bezier-curve drawing tool.
- **sort_visualization — 16 sorting algorithms animated in C++/SFML.** [code](https://github.com/ilyaeis/sort_visualization)
  (2022, C++/SFML) 16 sorting algorithms animated as columns, points, circles, spirals and pyramids, with shuffle patterns and speed control.

## Skills

- 3D & vision: Gaussian splatting, 3D reconstruction, computer vision, depth estimation, anti-aliasing, mesh generation, diffusion-based artifact fixing, PyTorch, CUDA kernels
- Research: paper-to-production, benchmarking and evaluation
- Languages: Python, C++, Dart/Flutter, JavaScript, Java, SQL
- Tools: Linux, Docker, Git/GitLab CI, ClearML, AWS S3, Pygame, Selenium, pandas
- Other: OpenAI API / LLM prompting, neuroevolution (NEAT), three.js/WebGL
- Spoken: Latvian, English, Russian
