# Ilja Safronovs

![Iļja Safronovs](https://ilyaeis.github.io/assets/photo/headshot.jpg)

R&D Engineer — 3D reconstruction · AI automation · Giraffe360 · Riga, Latvia

ilya.safronos@gmail.com · [GitHub](https://github.com/ilyaeis) · [LinkedIn](https://www.linkedin.com/in/i%C4%BCja-safronovs-eis)

I build 3D Gaussian splatting reconstruction from sparse panoramas at Giraffe360 (PyTorch, CUDA), and AI-agent tools for the team. Four of my results are in production: the windows and mirrors fix, my densification, the exterior orbital videos and the looped drone. For the team I built an agent-driven experiment runner and an MCP server for the task board.

## Experience

### Giraffe360 — R&D Engineer

Riga · 2025 – present. Giraffe360 makes cameras and software for real-estate virtual tours.

- **Fixed blurry windows, outdoor views and mirrors in sparse-panorama 3DGS; the production default since 1 June 2026.** [Giraffe360 post](https://www.instagram.com/p/DZsNRB8o772/)
  I ran 140+ controlled training runs, then 600+ experiments over one month to cut haze, floaters and flicker. The best setup became the default on 1 June 2026. Giraffe360 showed the result in a public post.
- **Built the sparse-panorama 3DGS training pipeline; my densification runs in production.**
  The pipeline turns sparse panorama views into 3D Gaussian splats. Jan 2026: influence-accumulation densification, building on Taming 3DGS (Mallick et al., 2024): it measures how much each Gaussian adds to the rendered images and moves the least useful ones; I ported it to the team’s new training approach, and it is still used. June 2026: Analytic-Splatting (Liang et al., 2024) in gsplat, with my CUDA forward and backward passes, used in a downsampling step. I also cut GPU idle time in training.
- **Shipped two 3D video features: exterior orbital videos and the looped drone (Oct 2026).** [Giraffe360 post](https://www.instagram.com/giraffe360/reel/Dd9ODBVIHhE/)
  Exterior: I built the toolkit that orients, selects and crops the outdoor splat, and the per-frame outdoor video pipeline; it makes the orbital view in production. Looped drone: my hackathon idea (Feb 2026, special mention; 3 of my ideas were recognised out of 51); I built its camera-path algorithm. For the drone, I restructured the video pipeline and agreed the look with designers. I also fixed the camera height in rooms on a half floor, for all video types.
- **Mentored a junior engineer on a new depth method; the whole team uses it.**
  Mostly his work, on denser LiDAR depth. Over time, teammates came to me with their pipeline questions.
- **AI automation: an agent-driven experiment runner, an MCP server for the team task board, a coding-agent harness.**
  March 2026: an experiment runner, so every teammate can run and track training on a local GPU through an AI agent. June 2026: an MCP server (Node.js), so AI agents can read and write the team task board, with authentication; colleagues use it. In my own time: a harness for coding agents; a master session plans and checks the work, and worker sessions run in their own git worktrees (private repo).

More about this role:

- **Built an embeddable Rust/wgpu splat viewer and a comparison tool.**
  A Rust/wgpu viewer (May 2026) that any app can embed and control, and a multi-view comparison tool (Jan 2026). The viewer also swaps and combines PLY scenes live, and renders point clouds. The comparison tool opens each reconstruction in its own window, with optional camera sync.
- **Prototypes: mirror reflections, meshes from splats, lighter splats.**
  Working prototypes: correct reflections in mirrors (June 2026), mesh generation from splats, a stage that cuts the splat count for viewers (May 2026), and a fly-in video intro. Feb 2026: I made Difix and NVIDIA’s fixer run on the shared GPUs, so the team could evaluate them.
- **Team tooling: ground-truth validation for splat quality, and one 3DGS monorepo.**
  July 2026: ground-truth datasets and validation tools, so every teammate can check splat quality against known ground truth. July 2026: I led the restructuring into one 3DGS monorepo, with a code-size check.
- **Jul–Oct 2025: a small LLM service that wrote tour narration.**
  It used the OpenAI API and AWS S3.

## Education

### Riga Technical University — Professional Bachelor, Financial Engineering

2024 – 2028 (expected). Probability, statistics, stochastic analysis, Monte Carlo methods, algorithms, databases.

### AI Talent Program (Ponder)

Nov 2024 – Jan 2025. C++, Python, maths and AI with industry mentors; it led to the Giraffe360 role.

### Riga State Classical Gymnasium — Programming and Mathematics track

State mathematics olympiads; Small Mathematics University (University of Latvia).

## Projects

- **Portfolio site: a walkable Gaussian splat of a real flat that I trained (gsplat, 730k splats).** [site](https://ilyaeis.github.io/)
  (2025–26, three.js, Spark, no build step) I trained the public Zip-NeRF “london” scene (Barron et al., 2023, CC BY 4.0) with gsplat MCMC: 30k steps in about 18 min on one RTX 3090, 28.3 dB PSNR on held-out views. The web gets 730k splats, and phones get a 350k lite model. The visitor walks the flat to four objects that stand for my R&D work, then a tunnel where two projects run as live visualizations. The page exposes a small agent API (window.journey, WebMCP tools) and llms.txt.
- **sort_visualization — 16 sorting algorithms in C++/SFML; runs in the browser (WebAssembly).** [run it](https://ilyaeis.github.io/apps/sorting/) · [code](https://github.com/ilyaeis/sort_visualization)
  (2022, C++/SFML) 16 sorting algorithms animated as columns, points, circles, spirals and pyramids, with shuffle patterns and speed control. The browser version runs the original algorithms, compiled to WebAssembly.
- **Offline Graphing Calculator — 4th place of 27 in a school competition.**
  (2023, with Iļja Volinskis) Graphing calculator that works offline; 4th place of 27 entries in the Riga Business School (RTU) programming competition for secondary school students (10 Jun 2023).
- **monte-carlo-finance — option pricing, volatility and risk models in Python.** [code](https://github.com/ilyaeis/monte-carlo-finance)
  (2026, Python) Monte Carlo option pricing with variance reduction (up to 1,900x), GARCH volatility, VaR backtests with the Kupiec test, efficient frontier from 30,000 portfolios and CAPM; a study project from RTU courses.
- **load-balancing-experiments — seven experiments on DNS, queueing and load balancing.** [code](https://github.com/ilyaeis/load-balancing-experiments)
  (2026, Python) Seven reproducible experiments for an RTU networks project: DNS round robin and anycast measured from Riga, a queueing simulation of load-balancing policies (“power of two choices”), consistent / rendezvous / Maglev hashing, a mini load balancer with health checks, packet capture.

More projects:

- **flow — offline workout tracker in Dart/Flutter, with CI and golden-image tests.**
  (2026, Dart/Flutter, private) Log sets with live timers; analysis of volume, load (ACWR), records and body measurements; custom formulas, JSON/CSV/PDF export, CI with golden-image tests.
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

## Skills

- 3D & vision: 3D Gaussian splatting (gsplat, CUDA kernels), 3D reconstruction from sparse views, computer vision, depth densification, mesh generation, 3D camera paths, splat viewers (Rust/wgpu, three.js/Spark), PyTorch
- Research: reading and implementing papers, controlled experiments, ground-truth evaluation
- Languages: Python, C++, Dart/Flutter, JavaScript, Java, SQL
- AI automation: LLM APIs (OpenAI), MCP servers (Node.js), agent-driven experiment runners, coding-agent harnesses
- Tools: Linux, Docker, Git/GitLab CI, AWS S3, three.js/WebGL, Pygame, Selenium, pandas
- Spoken: Latvian, English, Russian
