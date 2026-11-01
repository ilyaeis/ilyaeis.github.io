# Ilja Safronovs

![Iļja Safronovs](https://ilyaeis.github.io/assets/photo/headshot.jpg)

R&D Engineer — 3D reconstruction & computer vision · Giraffe360 · Riga, Latvia

ilya.safronos@gmail.com · [GitHub](https://github.com/ilyaeis) · [LinkedIn](https://www.linkedin.com/in/i%C4%BCja-safronovs-eis)

I work on 3D reconstruction: Gaussian splatting, and some mesh work. At Giraffe360 I build our splat pipeline from sparse panoramas and implement published methods in PyTorch and CUDA. I also work on depth models, 3D camera paths, LLM APIs and tools that help a team build faster.

## Experience

### Giraffe360 — R&D Engineer

Riga · 2025 – present. Giraffe360 makes cameras and software for real-estate virtual tours.

- **Fixed blurry windows and mirrors in sparse-panorama 3DGS; the default since 1 June 2026.** [Giraffe360 post](https://www.instagram.com/p/DZsNRB8o772/)
  Outdoor views through the windows are fixed too. I ran 140+ controlled training runs, then 600+ experiments over a month to cut haze, floaters and flicker. The best setup became the default on 1 June 2026. Giraffe360 showed the result publicly (post).
- **Built our custom 3DGS pipeline from sparse panoramas, with published methods in CUDA.**
  I built the pipeline that turns sparse panorama views into 3D Gaussian splats. Jan 2026: influence-based densification, building on Taming 3DGS (Mallick et al., 2024). June 2026: Analytic-Splatting (Liang et al., 2024) in gsplat, with my CUDA forward and backward passes. My densification measures how much each Gaussian adds to the rendered images and moves the least useful ones to better places. When the team moved to a new training approach, I ported it there, and it is still used. Analytic-Splatting integrates each Gaussian over the pixel area, which reduces aliasing; I used it in a downsampling algorithm. I also made training faster by measuring and cutting GPU idle time.
- **Shipped two 3D video features: orbital exterior videos and the looped drone.** [Giraffe360 post](https://www.instagram.com/giraffe360/reel/Dd9ODBVIHhE/)
  I led the exterior work: first results in 2 weeks, in production in 3. The looped drone was my hackathon idea (Feb 2026, special mention). I built its camera-path algorithm, and it launched in Oct 2026. For the exterior, I built the toolkit that orients, selects and crops the outdoor splat. For the drone, I restructured the video pipeline and agreed the look with designers. I also fixed a camera-path bug in rooms on a different floor level, for all video types, and prototyped a fly-in video intro.
- **Mentored a junior engineer on a new depth method; the whole team uses it.**
  Mostly his work: minima matching plus OMNI-DC to densify LiDAR depth. Over time, teammates came to me with their pipeline questions.
- **Built team tools: quality checks, an agent-driven experiment runner, an MCP server.**
  July 2026: ground-truth datasets and validation tools for splat quality. March 2026: an experiment runner, so every teammate can run and track training on a local GPU through an AI agent. June 2026: an MCP server (Node.js), so AI agents can read and write the team task board; colleagues use it. I also led the pipeline restructuring into one 3DGS monorepo (July 2026), with less duplicated code. In my own time I built a harness for coding agents: a master session plans and checks the work, and worker sessions run in their own git worktrees (private repo).

More about this role:

- **Built an embeddable Rust/wgpu splat viewer and a comparison tool.**
  A Rust/wgpu viewer (May 2026) that any app can embed and control, and a multi-view comparison tool (Jan 2026). The viewer also swaps and combines PLY scenes live, and renders point clouds. The comparison tool opens each reconstruction in its own window, with optional camera sync.
- **Prototypes: mirror reflections, meshes from splats and lighter splats.**
  Working prototypes: correct reflections in mirrors (June 2026), mesh generation from splats, and a stage that cuts the splat count for viewers (May 2026). I also made a diffusion-based artifact fixer (Difix, then NVIDIA Fixer) run on shared GPUs, so the team could test it.
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
  Selective program: C++, Python, maths and AI development with industry mentors. Theory of AI: its history, neural network architectures (CNNs, transformers, GANs, VAEs), computer vision and reinforcement learning. Led to the Giraffe360 role.

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
- Tools: Linux, Docker, Git/GitLab CI, AWS S3, Pygame, Selenium, pandas
- Other: OpenAI API / LLM prompting, neuroevolution (NEAT), three.js/WebGL
- Spoken: Latvian, English, Russian
