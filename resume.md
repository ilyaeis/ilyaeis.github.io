# Ilja Safronovs

![Iļja Safronovs](https://ilyaeis.github.io/assets/photo/headshot.jpg)

R&D Engineer — 3D reconstruction & computer vision · Giraffe360 · Riga, Latvia

ilya.safronos@gmail.com · [GitHub](https://github.com/ilyaeis) · [LinkedIn](https://www.linkedin.com/in/i%C4%BCja-safronovs-eis)

I work on 3D reconstruction and computer vision: Gaussian splatting pipelines, benchmarking systems that measure every change, and continuous research that turns the best new papers into production code. Financial Engineering student at RTU.

## Experience

### Giraffe360 — R&D Engineer

Riga · 2025 – present. Giraffe360 makes cameras and software for real-estate virtual tours.

- **Solved blurry windows and mirrors in sparse-panorama 3DGS.** [Giraffe360 post](https://www.instagram.com/p/DZsNRB8o772/)
  A depth regularizer flattened outdoor views onto the wall. Fixed after 700+ experiments; in production since June 2026. This was the main long-standing quality problem. Where a pixel’s accumulated opacity was not yet 1 at the wall, the regularizer also pulled the Gaussians behind the wall and behind windows on that pixel toward the wall depth. I found this root cause myself and changed the regularizer to handle depth differently inside and outside the room, so it acts only up to the wall, not past it. I added a training-time correction for the resulting artifacts. I ran 140+ controlled training runs first, then a month-long campaign of 600+ experiments to cut haze, floaters and flicker. The winning setup shipped as the default on June 1, 2026, and Giraffe360 showcased it publicly.
- **Shipped the looped drone video, from idea to production.** [Giraffe360 post](https://www.instagram.com/giraffe360/reel/Dd9ODBVIHhE/)
  I proposed it, agreed the look with designers, built the camera-path algorithm and shipped it; launched by Giraffe360, Oct 2026. A customer asked for it. It was also one of my ideas awarded at the internal hackathon in Feb 2026 (special mention). The original drone code, written by a colleague, was hard to understand and extend, so I first restructured the whole video pipeline to make it easy to configure (the restructuring described below). Then I built the looped drone on top of that setup.
- **Led the team that built outdoor splats and orbital videos.**
  2 weeks to show first results, 3 weeks to push good ones to production. I led the team. I built the toolkit that prepares the exterior splats: it rotates the scene to the correct orientation, selects the largest fragment and crops it. A per-frame outdoor-view video pipeline then renders the orbital video around the property.
- **Influence accumulation: my densification method, still the team’s best.**
  I found the research, implemented it, tested it and pushed it to production in Jan 2026. It is still the team’s best densification method. It measures how much each Gaussian contributes to the image during training and relocates the least useful ones, instead of adding new detail everywhere. This improves quality while keeping the model efficient. I implemented it partly with AI-assisted coding, and when the team moved to a new training approach, I ported it there.
- **Implemented Analytic-Splatting in gsplat at CUDA level.**
  June 2026: exact per-pixel Gaussian integration, which reduces aliasing. I wrote both the computation and its training part, and used it in a downsampling algorithm. I also sped up training by measuring and reducing GPU idle time.
- **Built tools to measure 3DGS quality against known ground truth.**
  Validation tools and ground-truth datasets (July 2026) to check quality against known truth. Before, quality was checked only with no-reference metrics. In March 2026 I also built an experiment runner, so every teammate can run and track training experiments on a local GPU, driven by an AI agent.

More about this role:

- **Mentored a junior engineer; together we replaced our depth algorithm.**
  Our depth estimates were poor. I mentored one junior engineer, and together we built a new depth algorithm (mostly his work): minima matching plus OMNI-DC to densify LiDAR depth. Depth is now good, and the whole team uses the new method. Over time, teammates came to me with their pipeline questions.
- **Led the pipeline restructuring and created a 3DGS monorepo.**
  Led the restructuring (July 2026) and created a monorepo for all 3DGS extensions and client apps: ~3000-line files split, duplication removed, defects fixed. I added an automatic check that stops files and functions growing too large. Cleaning up the drone camera path exposed three hidden defects: for example, the camera jerked away when two highlighted features sat close together, and its tilt could drift outside the allowed range. The cleanup also let me fix a long-standing camera-path bug: in rooms higher or lower than the rest of the storey, the camera sat too low and showed the floor. The fix shipped for all video types.
- **Built an embeddable Rust/wgpu splat viewer and a comparison tool.**
  Rust/wgpu viewer (May 2026) that any app can embed and control, plus a multi-view comparison tool (Jan 2026). In July 2026 I added single-view PLY comparison to the new viewer: folder browsing, live scene swapping and combining several scenes. It also renders ordinary point-cloud PLY files. The comparison tool loads reconstructions from experiment-tracking tasks and opens each in its own window with optional camera sync, so teams can compare from any viewpoint, not only through video.
- **Prototyped two new video concepts: correct mirror reflections and a fly-in intro.**
  Two working prototypes (June 2026): correct reflections in mirrors, and a fly-in video intro. The fly-in shot starts high above the property with the ceilings removed and all rooms visible, then descends and blends into an eye-level walkthrough of the real splat.
- **Worked on mesh generation and point-count reduction for viewers.**
  Mesh generation from splats, combined with Gaussian splats; a point-count reduction stage (May 2026) for viewers. The reduction stage cuts the number of splats while keeping the major details. Viewers and compressed scene files need it, so that every client device can run at least some level of detail. It is a prototype on a separate branch.
- **Made diffusion-based artifact fixing runnable on shared GPUs.**
  Made a diffusion-based artifact-fixing tool (Difix, then NVIDIA Fixer) run remotely on shared GPUs in Feb 2026. Before, it ran out of memory on every local machine, so nobody on the team could evaluate it. Running it on shared GPUs turned it from a black box into something the team can test.
- **Three hackathon ideas recognized; the looped drone shipped.**
  Internal hackathon, Feb 2026: three of my ideas recognized, two with special mentions. The ideas were text and logo inside the scene on video, a video made from still photos (special mention) and a looped drone in each room (special mention). The looped drone then became a shipped feature.
- **Built an MCP server for the team task board.**
  An MCP server (June 2026, Node.js) so AI agents and tools can read and write the team task board. It covers projects, tasks and decisions, with authentication and a one-time setup, and colleagues use it. I also added a compact graph view of the task tree with detailed cards (assignee, status, age, project members).
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
