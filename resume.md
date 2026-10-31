# Ilja Safronovs

R&D Engineer — 3D reconstruction & computer vision · Giraffe360 · Riga, Latvia

ilya.safronos@gmail.com · [GitHub](https://github.com/ilyaeis) · [LinkedIn](https://www.linkedin.com/in/i%C4%BCja-safronovs-eis)

I work on 3D reconstruction and computer vision: Gaussian splatting pipelines, benchmarking systems that measure every change, and continuous research that turns the best new papers into production code. Financial Engineering student at RTU.

## Experience

### Giraffe360 — R&D Engineer

Riga · 2025 – present. Giraffe360 makes cameras and software for real-estate virtual tours.

- Solved the long-standing window, outdoor-view and mirror quality problem in 3DGS video. I found the root cause (wrong depth behind windows and walls), handled depth differently inside and outside the room, and added a training-time correction. 700+ controlled experiments back it. It runs in production and was [publicly showcased by Giraffe360](https://www.instagram.com/p/DZsNRB8o772/).
- Research to production: developed “influence accumulation”, which measures each Gaussian’s contribution to the image and relocates the least useful ones during training (in production). Implemented Analytic-Splatting (exact per-pixel Gaussian integration) in gsplat at CUDA level, which reduces aliasing; it is used in a downsampling algorithm.
- Benchmarking and evaluation: validation tools and ground-truth datasets, so the team measures quality against known truth; an experiment runner for agent-driven research loops on local GPUs; GPU training and evaluation on ClearML.
- Led the restructuring of the reconstruction-pipeline codebase: a code-quality standard, ~3000-line files split, duplication removed, hidden camera-path defects fixed. This made it possible to fix a long-standing half-floor camera-height problem.
- An embeddable Rust/wgpu splat viewer package with host control and single-view PLY comparison, and a side-by-side multi-view comparison tool.
- An exterior (outdoor) orbital-view toolkit, used in production.
- Working prototypes: mirror planes with correct reflections; a fly-in “dollhouse” video intro.
- A point-count reduction stage for web viewers.
- Diffusion-based artifact fixing (Difix, NVIDIA Fixer) made runnable on shared GPUs.
- 3 ideas recognized at an internal hackathon (top 20 and 2 special mentions).
- Mentored a junior engineer through a depth bug.
- An MCP server so AI agents can read and write the team task board (Node.js).
- Earlier (Jul–Oct 2025): a small LLM service that wrote tour narration (OpenAI API, AWS, S3).

## Education

### Riga Technical University — Professional Bachelor, Financial Engineering

2024 – 2028 (expected)

- Qualification: senior data analysis specialist. Maths, statistics and programming applied to finance.
- Coursework: mathematical analysis and algebra, probability and statistics, econometrics, time-series analysis, stochastic analysis, Monte Carlo methods, portfolio analysis, actuarial mathematics, data structures and algorithms, databases/SQL, computer networks, programming (Java, C++).

### AI Talent Program (Ponder)

Nov 2024 – Jan 2025 · Mākslīgā intelekta talantu programma

- Selective program: C++, Python, maths and AI development with industry mentors. Led to the Giraffe360 role.

### Riga State Classical Gymnasium — Programming and Mathematics track

Rīgas Valsts klasiskā ģimnāzija

- Specialised track in programming and mathematics (today named "Programming + AI"). Latvian state mathematics olympiads; completed the Small Mathematics University (Mazā matemātikas universitāte) at the University of Latvia.

## Projects

- [load-balancing-experiments](https://github.com/ilyaeis/load-balancing-experiments) (2026, Python) — seven reproducible experiments for an RTU networks project: DNS round robin and anycast measured from Riga, a queueing simulation of load-balancing policies ("power of two choices"), consistent / rendezvous / Maglev hashing, a mini load balancer with health checks, packet capture.
- flow — offline workout tracker (2026, Dart/Flutter, private) — log sets with live timers; analysis of volume, load (ACWR), records and body measurements; custom formulas, JSON/CSV/PDF export, CI with golden-image tests. In daily use.
- [monte-carlo-finance](https://github.com/ilyaeis/monte-carlo-finance) (2026, Python) — Monte Carlo option pricing with variance reduction (up to 1,900x), GARCH volatility, VaR backtests with the Kupiec test, efficient frontier from 30,000 portfolios and CAPM; a study project from RTU courses.
- Portfolio journey ([this site](https://ilyaeis.github.io/)) (2025–26, three.js) — a tap-driven WebGL world: RK4-integrated strange attractors, a single-stroke vector font, bloom, one continuous comet trail. No build step.
- Offline Graphing Calculator (2023, with Iļja Volinskis) — graphing calculator that works offline; 4th place of 27 entries in the Riga Business School (RTU) programming competition for secondary school students (10 Jun 2023).

More projects:

- [crypto-quant-lab](https://github.com/ilyaeis/crypto-quant-lab) (2026, Python) — 59 backtested versions of drift and volatility-targeting rules on 6 coins with a 1% fee. The source was recovered from Python 3.12 bytecode, and all 153 functions were verified.
- [projects_with_NEAT](https://github.com/ilyaeis/projects_with_NEAT) (2025, Python) — neuroevolution (NEAT) agents that learn Flappy Bird and Pong; a documented attempt at multi-snake survival.
- [RTU_program_parser](https://github.com/ilyaeis/RTU_program_parser) (2025, Python/Selenium/pandas, with Aleksejs Peņkovs) — scrapes the RTU timetable and finds extra lectures that fit a student's own schedule; exports to Excel.
- [Snake + maze generator](https://github.com/ilyaeis/Snake_plus_Maze_Path_algorithm_gen_2) (2024–25, Python/Pygame) — DFS maze generation, dynamic terrain (lava, forest, rivers), BFS path-finding.
- [bezier-curve-js](https://github.com/ilyaeis/bezier-curve-js) (2023, JavaScript) — interactive Bezier-curve drawing tool.
- [sort_visualization](https://github.com/ilyaeis/sort_visualization) (2022, C++/SFML) — 16 sorting algorithms animated as columns, points, circles, spirals and pyramids, with shuffle patterns and speed control.

## Skills

- 3D & vision: Gaussian splatting, 3D reconstruction, computer vision, depth estimation, anti-aliasing, mesh generation, diffusion-based artifact fixing, PyTorch, CUDA kernels
- Research: paper-to-production, benchmarking and evaluation
- Languages: Python, C++, Dart/Flutter, JavaScript, Java, SQL
- Tools: Linux, Docker, Git/GitLab CI, ClearML, AWS S3, Pygame, Selenium, pandas
- Other: OpenAI API / LLM prompting, neuroevolution (NEAT), three.js/WebGL
- Spoken: Latvian, English, Russian
