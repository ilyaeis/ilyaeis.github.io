# Ilja Safronovs

R&D engineer, 3D reconstruction. Giraffe360, Riga, Latvia.

ilya.safronos@gmail.com | [github.com/ilyaeis](https://github.com/ilyaeis) | [linkedin.com/in/iļja-safronovs-eis](https://www.linkedin.com/in/i%C4%BCja-safronovs-eis) | [ilyaeis.github.io](https://ilyaeis.github.io/)

I work on 3D Gaussian splatting at Giraffe360: training from sparse panoramas, in PyTorch and CUDA. Most of my work starts with a reconstruction that looks wrong. **I find the cause and fix it in our training code.** I mentored a junior engineer and led three engineers on a new 3D reconstruction feature. **Next, I want to grow into leading a team.**

## Experience

**Giraffe360**, R&D engineer. Riga, 2025 to present.

Giraffe360 makes cameras and software for real-estate virtual tours. I am in the R&D team, on the 3D reconstruction pipeline.

- **Blurry windows, outdoor views and mirrors in our 3D videos.** I found the cause and tested fixes in training runs until the haze and floaters were gone. Builds on the team's earlier window masks. **Default in all Giraffe360 Gaussian splat videos since June 2026.** Before and after: https://www.instagram.com/p/DZsNRB8o772/
- **Our training defaults use my Gaussian pruning and relocation rules** (Jan to Jul 2026). They build on Taming 3DGS (Mallick et al., 2024) and the team's influence tracking: a Gaussian that adds little to the renders gets pruned or moved.
- **Implemented Analytic-Splatting (Liang et al., 2024) in gsplat**, CUDA forward and backward passes. We use it for downsampling.
- Cut GPU idle time in training.
- **Looped drone video**, one flight per room. My idea from the Feb 2026 hackathon (I submitted 6 ideas; 3 of them were among the 51 recognised). I wrote the camera path and reworked the video pipeline. The look was worked out with the designers. **It is a product now**: https://www.instagram.com/giraffe360/reel/Dd9ODBVIHhE/
- Fixed the camera height in rooms on a half floor, for all video types. A long-standing bug.
- **Led three engineers on a new 3D reconstruction feature** (Oct 2026). Most of the code is mine; I reviewed and merged theirs and cut the release. In production. I have cut the releases of our 3D pipeline since September 2026.
- **Mentored a junior engineer on a new depth method** (denser LiDAR depth). Mostly his work. Our splat training has run on it since October 2026.
- **Team tools.** An experiment runner: an AI agent starts and tracks trainings on a local GPU. An MCP server (Node.js) for our task board. Ground-truth datasets and checks for splat quality. I also led the move of our 3DGS code into one monorepo, with a code-size check (2026).
- **A Rust/wgpu splat viewer that other apps can embed and control** (May 2026). It swaps and combines PLY scenes live, and shows point clouds. Before that, a side-by-side comparison tool with camera sync.
- **Prototypes**: mirror reflections done right, meshes from splats, a stage that cuts the splat count for viewers, a fly-in video intro. Got Difix and NVIDIA's fixer running on our GPUs for the team to try (Feb 2026).
- Jul to Oct 2025: a small service that wrote tour narration with the OpenAI API and AWS S3.

## Education

**Riga Technical University**, Professional Bachelor, Financial Engineering. 2024 to 2028 (expected).
Probability, statistics, stochastic analysis, Monte Carlo methods, algorithms, databases.

**AI Talent Program** (Ponder). Nov 2024 to Jan 2025.
C++, Python, maths and AI, with mentors from industry. That is how I got the Giraffe360 job.

**Riga State Classical Gymnasium**, programming and mathematics track.
State mathematics olympiads. Small Mathematics University (University of Latvia).

## Projects

- **Portfolio site** (2026): [ilyaeis.github.io](https://ilyaeis.github.io/#flat). A live Gaussian splat of a flat that I trained with gsplat on public Zip-NeRF photos, 18 minutes on one RTX 3090.
- [**sort_visualization**](https://github.com/ilyaeis/sort_visualization) (2022, C++/SFML): 16 sorting algorithms animated as columns, points, circles, spirals and pyramids. The same C++ runs [in the browser](https://ilyaeis.github.io/apps/sorting/), compiled to WebAssembly.
- [**monte-carlo-finance**](https://github.com/ilyaeis/monte-carlo-finance) (2026, Python): option pricing with variance reduction, GARCH volatility, VaR backtests with the Kupiec test, efficient frontier, CAPM. From RTU coursework.
- [**load-balancing-experiments**](https://github.com/ilyaeis/load-balancing-experiments) (2026, Python), for an RTU networks course: DNS round robin and anycast measured from Riga, a queueing simulation of balancing policies, consistent, rendezvous and Maglev hashing, a small load balancer with health checks, packet capture.
- [**crypto-quant-lab**](https://github.com/ilyaeis/crypto-quant-lab) (2026, Python): backtests of drift and volatility-targeting rules on 6 coins with a 1% fee.
- **flow** (2026, Dart/Flutter, private): offline workout tracker. Live rest timers, volume and load (ACWR) analysis, JSON/CSV/PDF export, CI with golden-image tests.
- [**Coding-agent harness**](https://github.com/ilyaeis/claude-harness) (own time): one master session plans and checks the work; workers run in their own git worktrees.
- [**projects_with_NEAT**](https://github.com/ilyaeis/projects_with_NEAT) (2025, Python): NEAT agents that learn Flappy Bird and Pong.
- [**RTU_program_parser**](https://github.com/ilyaeis/RTU_program_parser) (2025, Python, with Aleksejs Peņkovs): scrapes the RTU timetable and finds extra lectures that fit your schedule.
- **Offline Graphing Calculator** (2023, with Iļja Volinskis): 4th of 27 entries in the Riga Business School programming competition for school students.
- Older: [Snake with a maze generator](https://github.com/ilyaeis/Snake_plus_Maze_Path_algorithm_gen_2) (Pygame, 2024), [bezier-curve-js](https://github.com/ilyaeis/bezier-curve-js) (2023).

## Skills

Python, C++, CUDA, PyTorch, gsplat, Rust/wgpu, Dart/Flutter, JavaScript/three.js, Java, SQL.
Linux, Docker, Git and GitLab CI, AWS S3, Node.js (MCP servers), OpenAI API.
Latvian, English, Russian.

With the R&D team at Giraffe360. Methods build on Taming 3DGS (Mallick et al., 2024) and Analytic-Splatting (Liang et al., 2024).
