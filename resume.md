# Ilja Safronovs

R&D engineer, 3D reconstruction. Giraffe360, Riga, Latvia.

ilya.safronos@gmail.com | [github.com/ilyaeis](https://github.com/ilyaeis) | [linkedin.com/in/iļja-safronovs-eis](https://www.linkedin.com/in/i%C4%BCja-safronovs-eis) | [ilyaeis.github.io](https://ilyaeis.github.io/)

I work on 3D Gaussian splatting at Giraffe360: training from sparse panoramas, in PyTorch and CUDA. Most of my work starts with a reconstruction that looks wrong. I find out why, then I test fixes in training runs until one is good enough for production. I mentored a junior engineer and led three engineers on a new 3D reconstruction feature. Next, I want to grow into leading a team.

## Experience

**Giraffe360**, R&D engineer. Riga, 2025 to present.

Giraffe360 makes cameras and software for real-estate virtual tours. The R&D team builds the 3D reconstruction pipeline behind the 3D videos.

- Windows, outdoor views and mirrors were blurry in our 3D videos. I found the cause and tested fixes in controlled training runs until the haze, floaters and flicker were gone. The fix builds on the team's earlier window masks. It has been the default for PRO camera projects since June 2026. Before and after: https://www.instagram.com/p/DZsNRB8o772/
- Wrote the Gaussian pruning and relocation rules in our training defaults (Jan to Jul 2026). They build on Taming 3DGS (Mallick et al., 2024) and the team's influence tracking: each Gaussian is scored by how much it adds to the rendered images, and the least useful ones are removed or moved.
- Implemented Analytic-Splatting (Liang et al., 2024) in gsplat, with CUDA forward and backward passes. We use it in a downsampling step (June 2026). I also cut GPU idle time in training.
- Looped drone video, one flight per room. It was my idea at the Feb 2026 hackathon, where 3 of my ideas were recognised out of 51. I wrote the camera path, restructured the video pipeline and agreed the look with the designers. It is a product now: https://www.instagram.com/giraffe360/reel/Dd9ODBVIHhE/
- Exterior orbital videos (Oct 2026): the toolkit that orients, selects and crops the outdoor scene, and the per-frame video pipeline. Earlier I fixed the camera height in rooms on a half floor, for all video types.
- Led three engineers on a new 3D reconstruction feature (Oct 2026). I wrote most of the code, reviewed and merged their work, and cut the release. It runs in production. Since September 2026 I cut the releases of our 3D pipeline.
- Mentored a junior engineer on a new depth method (denser LiDAR depth). The work is mostly his. Our splat training has used it since October 2026.
- Tools the team uses: an experiment runner, so anyone can start and track a training on a local GPU through an AI agent (March 2026); an MCP server in Node.js for the team task board, with authentication (June 2026); ground-truth datasets and checks for splat quality (July 2026). I led the move of our 3DGS code into one monorepo, with a code-size check (July 2026).
- A Rust/wgpu splat viewer that other apps can embed and control. It swaps and combines PLY scenes live and renders point clouds (May 2026). A side-by-side comparison tool with optional camera sync (Jan 2026).
- Prototypes: correct reflections in mirrors, meshes from splats, a stage that cuts the splat count for viewers, a fly-in video intro. I also got Difix and NVIDIA's fixer running on our GPUs so the team could evaluate them (Feb 2026).
- Jul to Oct 2025: a small service that wrote tour narration with the OpenAI API and AWS S3.

## Education

**Riga Technical University**, Professional Bachelor, Financial Engineering. 2024 to 2028 (expected).
Probability, statistics, stochastic analysis, Monte Carlo methods, algorithms, databases.

**AI Talent Program** (Ponder). Nov 2024 to Jan 2025.
C++, Python, maths and AI, with mentors from industry. It led to the Giraffe360 job.

**Riga State Classical Gymnasium**, programming and mathematics track.
State mathematics olympiads. Small Mathematics University (University of Latvia).

## Projects

- [Portfolio site](https://ilyaeis.github.io/) (2025 to 2026): a splat of a real flat that I trained with gsplat MCMC on the public Zip-NeRF "london" scene (Barron et al., 2023, CC BY 4.0). 30k steps, about 18 minutes on one RTX 3090, 28.3 dB PSNR on held-out views. A 1 MB preview loads first, then a 350k-splat model. three.js and Spark, no build step.
- [sort_visualization](https://github.com/ilyaeis/sort_visualization) (2022, C++/SFML): 16 sorting algorithms animated as columns, points, circles, spirals and pyramids. The same C++ runs [in the browser](https://ilyaeis.github.io/apps/sorting/), compiled to WebAssembly.
- [monte-carlo-finance](https://github.com/ilyaeis/monte-carlo-finance) (2026, Python): option pricing with variance reduction, GARCH volatility, VaR backtests with the Kupiec test, efficient frontier, CAPM. From RTU coursework.
- [load-balancing-experiments](https://github.com/ilyaeis/load-balancing-experiments) (2026, Python): DNS round robin and anycast measured from Riga, a queueing simulation of balancing policies, consistent, rendezvous and Maglev hashing, a small load balancer with health checks, packet capture. An RTU networks project.
- [crypto-quant-lab](https://github.com/ilyaeis/crypto-quant-lab) (2026, Python): backtests of drift and volatility-targeting rules on 6 coins with a 1% fee.
- flow (2026, Dart/Flutter, private): offline workout tracker. Live rest timers, volume and load (ACWR) analysis, JSON/CSV/PDF export, CI with golden-image tests.
- Coding-agent harness (private): a master session plans and checks the work, worker sessions run in their own git worktrees. Own time.
- [projects_with_NEAT](https://github.com/ilyaeis/projects_with_NEAT) (2025, Python): NEAT agents that learn Flappy Bird and Pong.
- [RTU_program_parser](https://github.com/ilyaeis/RTU_program_parser) (2025, Python, with Aleksejs Peņkovs): scrapes the RTU timetable and finds extra lectures that fit your schedule.
- Offline Graphing Calculator (2023, with Iļja Volinskis): 4th of 27 entries in the Riga Business School programming competition for school students.
- Older: [Snake with a maze generator](https://github.com/ilyaeis/Snake_plus_Maze_Path_algorithm_gen_2) (Pygame, 2024), [bezier-curve-js](https://github.com/ilyaeis/bezier-curve-js) (2023).

## Skills

Python, C++, CUDA, PyTorch, gsplat, Rust/wgpu, Dart/Flutter, JavaScript/three.js, Java, SQL.
Linux, Docker, Git and GitLab CI, AWS S3, Node.js (MCP servers), OpenAI API.
Latvian, English, Russian.

With the R&D team at Giraffe360. Methods build on Taming 3DGS (Mallick et al., 2024) and Analytic-Splatting (Liang et al., 2024).
