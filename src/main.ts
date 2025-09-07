/**
 * Inside this file you will use the classes and functions from rx.js
 * to add visuals to the svg element in index.html, animate them, and make them interactive.
 *
 * Study and complete the tasks in observable exercises first to get ideas.
 *
 * Course Notes showing Asteroids in FRP: https://tgdwyer.github.io/asteroids/
 *
 * You will be marked on your functional programming style
 * as well as the functionality that you implement.
 *
 * Document your code!
 */

import "./style.css";

import {
    Observable,
    catchError,
    filter,
    fromEvent,
    interval,
    merge,
    map,
    scan,
    switchMap,
    take,
    startWith,
    withLatestFrom,
    share,
    EMPTY,
    of,
} from "rxjs";
import { fromFetch } from "rxjs/fetch";

/** Constants */

const Viewport = {
    CANVAS_WIDTH: 600,
    CANVAS_HEIGHT: 400,
} as const;

const Birb = {
    WIDTH: 42,
    HEIGHT: 30,
} as const;

const Constants = {
    PIPE_WIDTH: 120,
    PIPE_HEIGHT: 400,
    PIPE_SPEED: 3,
    PIPE_SPAWN_DISTANCE: 250,
    GRAVITY: 0.5,
    JUMP_VELOCITY: -5,
    TICK_RATE_MS: 30,
    /** Hit cooldown in ticks to prevent draining all lives in a single overlap */
    HIT_COOLDOWN_TICKS: 30,
    /** How long to show the damage indicator after losing a life (ticks) */
    DAMAGE_TICKS: 30,
} as const;

// User input

type Key = "Space";

// State processing

type Bird = Readonly<{
    x: number;
    y: number;
    velocity: number;
}>;

type Ghost = Readonly<{
    x: number;
    y: number;
    velocity: number;
    dead?: boolean; // for filtering out ghosts that died last run
}>;

type Pipe = Readonly<{
    id: number;
    x: number;
    gapY: number;
    gapHeight: number;
    time: number;
    scored?: boolean; // becomes true once the bird has passed this pipe pair
}>;

// FRP State: the single immutable source of truth that evolves over time
type State = Readonly<{
    gameEnd: boolean;
    won: boolean;
    bird: Bird;
    ghosts?: readonly Ghost[]; // all ghost birds (non-interactive)
    pipes: readonly Pipe[];
    lives: number;
    score: number;
    gameTime: number;
    hitCooldown: number; // ticks remaining until next life can be lost
    totalPipes: number; // total number of pipe pairs in level
    damageTicks: number; // ticks remaining to show -hp indicator
}>;

const initialState: State = {
    gameEnd: false,
    won: false,
    bird: {
        x: Viewport.CANVAS_WIDTH * 0.3,
        y: Viewport.CANVAS_HEIGHT / 2,
        velocity: 0,
    },
    pipes: [],
    lives: 3,
    score: 0,
    gameTime: 0,
    hitCooldown: 0,
    totalPipes: 0,
    damageTicks: 0,
};

/** Utility: clamp value to [min, max] */
const clamp = (value: number, min: number, max: number): number =>
    Math.max(min, Math.min(max, value));

/** Axis-aligned rectangle intersection */
const rectsIntersect = (
    ax: number,
    ay: number,
    aw: number,
    ah: number,
    bx: number,
    by: number,
    bw: number,
    bh: number,
): boolean =>
    !(ax + aw <= bx || bx + bw <= ax || ay + ah <= by || by + bh <= ay);

/**
 * Parses CSV content and converts it to pipe data
 * @param csvContent CSV content string
 * @returns Array of pipe data
 */
const parsePipeData = (csvContent: string): readonly Pipe[] => {
    const lines = csvContent.trim().split("\n");
    const pipes: Pipe[] = [];

    for (let i = 1; i < lines.length; i++) {
        const [gapY, gapHeight, time] = lines[i].split(",").map(Number);
        pipes.push({
            id: i - 1,
            x: Viewport.CANVAS_WIDTH + (i - 1) * Constants.PIPE_SPAWN_DISTANCE,
            gapY: gapY * Viewport.CANVAS_HEIGHT,
            gapHeight: gapHeight * Viewport.CANVAS_HEIGHT,
            time: time,
        });
    }

    return pipes;
};

/**
 * Updates the state by proceeding with one time step.
 *
 * @param s Current state
 * @returns Updated state
 */
const tick = (s: State) => s;

// Rendering (side effects)

/**
 * Brings an SVG element to the foreground.
 * @param elem SVG element to bring to the foreground
 */
const bringToForeground = (elem: SVGElement): void => {
    elem.parentNode?.appendChild(elem);
};

/**
 * Displays a SVG element on the canvas. Brings to foreground.
 * @param elem SVG element to display
 */
const show = (elem: SVGElement): void => {
    elem.setAttribute("visibility", "visible");
    bringToForeground(elem);
};

/**
 * Hides a SVG element on the canvas.
 * @param elem SVG element to hide
 */
const hide = (elem: SVGElement): void => {
    elem.setAttribute("visibility", "hidden");
};

/**
 * Creates an SVG element with the given properties.
 *
 * See https://developer.mozilla.org/en-US/docs/Web/SVG/Element for valid
 * element names and properties.
 *
 * @param namespace Namespace of the SVG element
 * @param name SVGElement name
 * @param props Properties to set on the SVG element
 * @returns SVG element
 */
const createSvgElement = (
    namespace: string | null,
    name: string,
    props: Record<string, string> = {},
): SVGElement => {
    const elem = document.createElementNS(namespace, name) as SVGElement;
    Object.entries(props).forEach(([k, v]) => elem.setAttribute(k, v));
    return elem;
};

const render = (): ((s: State) => void) => {
    // Canvas elements
    const gameOver = document.querySelector("#gameOver") as SVGElement;
    const container = document.querySelector("#main") as HTMLElement;

    // Text fields
    const livesText = document.querySelector("#livesText") as HTMLElement;
    const scoreText = document.querySelector("#scoreText") as HTMLElement;

    const svg = document.querySelector("#svgCanvas") as SVGSVGElement;

    svg.setAttribute(
        "viewBox",
        `0 0 ${Viewport.CANVAS_WIDTH} ${Viewport.CANVAS_HEIGHT}`,
    );

    /**
     * Renders the current state to the canvas.
     *
     * In MVC terms, this updates the View using the Model.
     *
     * @param s Current state
     */
    return (s: State) => {
        // Clear previous frame
        svg.innerHTML = "";

        // Add background image
        const backgroundImg = createSvgElement(svg.namespaceURI, "image", {
            href: "../assets/bg.jpg",
            x: "0",
            y: "0",
            width: `${Viewport.CANVAS_WIDTH}`,
            height: `${Viewport.CANVAS_HEIGHT}`,
            preserveAspectRatio: "xMidYMid slice",
        });
        svg.appendChild(backgroundImg);

        // Render pipes
        s.pipes.forEach(pipe => {
            if (
                pipe.x > -Constants.PIPE_WIDTH &&
                pipe.x < Viewport.CANVAS_WIDTH + Constants.PIPE_WIDTH
            ) {
                // Calculate the pixel height of the current pipe's top and bottom parts
                const topPipeHeight = Math.max(
                    0,
                    pipe.gapY - pipe.gapHeight / 2,
                );
                const bottomPipeY = pipe.gapY + pipe.gapHeight / 2;
                const bottomPipeHeight = Math.max(
                    0,
                    Viewport.CANVAS_HEIGHT - bottomPipeY,
                );

                // Top pipe: grow from top to bottom
                if (topPipeHeight > 0) {
                    const topGroup = createSvgElement(svg.namespaceURI, "g");
                    topGroup.setAttribute(
                        "transform",
                        `translate(${pipe.x}, ${topPipeHeight}) scale(1, -1)`,
                    );
                    const topImg = createSvgElement(svg.namespaceURI, "image", {
                        href: "../assets/pipe.png",
                        x: "0",
                        y: "0",
                        width: `${Constants.PIPE_WIDTH}`,
                        height: `${topPipeHeight}`,
                        preserveAspectRatio: "none",
                    });
                    topGroup.appendChild(topImg);
                    svg.appendChild(topGroup);
                }

                // Bottom pipe: grow from bottom to top
                if (bottomPipeHeight > 0) {
                    const bottomImg = createSvgElement(
                        svg.namespaceURI,
                        "image",
                        {
                            href: "../assets/pipe.png",
                            x: `${pipe.x}`,
                            y: `${bottomPipeY}`,
                            width: `${Constants.PIPE_WIDTH}`,
                            height: `${bottomPipeHeight}`,
                            preserveAspectRatio: "none",
                        },
                    );
                    svg.appendChild(bottomImg);
                }
            }
        });

        // Add ghosts (semi-transparent, non-interactive)
        if (s.ghosts && s.ghosts.length) {
            s.ghosts
                .filter(g => !g.dead) // filter out ghosts that died last run
                .forEach(g => {
                    const ghostImg = createSvgElement(
                        svg.namespaceURI,
                        "image",
                        {
                            href: "../assets/birb.png",
                            x: `${s.bird.x - Birb.WIDTH / 2}`,
                            y: `${g.y - Birb.HEIGHT / 2}`,
                            width: `${Birb.WIDTH}`,
                            height: `${Birb.HEIGHT}`,
                            opacity: "0.35",
                        },
                    );
                    svg.appendChild(ghostImg);
                });
        }

        // Add bird
        const birdImg = createSvgElement(svg.namespaceURI, "image", {
            href: "../assets/birb.png",
            x: `${s.bird.x - Birb.WIDTH / 2}`,
            y: `${s.bird.y - Birb.HEIGHT / 2}`,
            width: `${Birb.WIDTH}`,
            height: `${Birb.HEIGHT}`,
        });
        svg.appendChild(birdImg);

        // Damage indicator above the bird when a life is lost
        if (s.damageTicks > 0) {
            const hpW = 40;
            const hpH = 20;
            const dmgImg = createSvgElement(svg.namespaceURI, "image", {
                href: "../assets/-hp.png",
                x: `${s.bird.x - hpW / 2}`,
                y: `${s.bird.y - Birb.HEIGHT / 2 - hpH - 4}`,
                width: `${hpW}`,
                height: `${hpH}`,
            });
            svg.appendChild(dmgImg);
        }

        // Update UI
        if (livesText) livesText.textContent = s.lives.toString();
        if (scoreText) scoreText.textContent = s.score.toString();

        // Game Over / Win overlay with replay button
        if (s.gameEnd) {
            // Dim the scene
            const dimRect = createSvgElement(svg.namespaceURI, "rect", {
                x: "0",
                y: "0",
                width: `${Viewport.CANVAS_WIDTH}`,
                height: `${Viewport.CANVAS_HEIGHT}`,
                fill: "black",
                opacity: "0.45",
            });
            svg.appendChild(dimRect);

            // Result image (win or game over)
            const goW = Math.floor(Viewport.CANVAS_WIDTH * 0.9);
            const goH = Math.floor(Viewport.CANVAS_HEIGHT * 0.8);
            const gameOverImg = createSvgElement(svg.namespaceURI, "image", {
                href: s.won
                    ? "../assets/winning.png"
                    : "../assets/gameover.png",
                x: `${(Viewport.CANVAS_WIDTH - goW) / 2}`,
                y: `${Viewport.CANVAS_HEIGHT * 0.3 - goH / 2}`,
                width: `${goW}`,
                height: `${goH}`,
                id: "gameOverImg",
            });
            svg.appendChild(gameOverImg);

            // Replay button image
            const rpW = Math.floor(Viewport.CANVAS_WIDTH * 0.8);
            const rpH = Math.floor(Viewport.CANVAS_HEIGHT * 0.15);
            const replayBtn = createSvgElement(svg.namespaceURI, "image", {
                href: "../assets/restart.png",
                x: `${(Viewport.CANVAS_WIDTH - rpW) / 2}`,
                y: `${Viewport.CANVAS_HEIGHT * 0.75 - rpH / 2}`,
                width: `${rpW}`,
                height: `${rpH}`,
                id: "replayBtn",
            });
            svg.appendChild(replayBtn);
        }
    };
};

export const state$ = (csvContents: string): Observable<State> => {
    // keydown event
    const key$ = fromEvent<KeyboardEvent>(document, "keydown");
    const flap$ = key$.pipe(filter(({ code }) => code === "Space"));

    const tick$ = interval(Constants.TICK_RATE_MS); // time step interval: 30ms
    const tickIndex$ = tick$.pipe(
        scan(i => i + 1, 0),
        startWith(0),
    );

    // Parse pipe data from CSV
    const pipeData = parsePipeData(csvContents);

    // Initialize state with pipe data
    const initialGameState: State = {
        ...initialState,
        pipes: pipeData,
        totalPipes: pipeData.length,
    };

    type Reducer = (s: State) => State;

    // Physics tick: gravity integration, position update, pipe scrolling.
    const physics$: Observable<Reducer> = tick$.pipe(
        map(
            (): Reducer => (s: State) => {
                // Freeze world when game has ended
                if (s.gameEnd) return s;
                const newVelocity = s.bird.velocity + Constants.GRAVITY;
                const newY = s.bird.y + newVelocity;

                // Clamp bird within screen
                const clampedY = clamp(
                    newY,
                    Birb.HEIGHT / 2,
                    Viewport.CANVAS_HEIGHT - Birb.HEIGHT / 2,
                );

                // Move pipes
                const movedPipes = s.pipes.map(pipe => ({
                    ...pipe,
                    x: pipe.x - Constants.PIPE_SPEED,
                }));
                const updatedPipes = movedPipes.filter(
                    pipe => pipe.x > -Constants.PIPE_WIDTH,
                );

                // Score & pipe collision using center-line rule to avoid PNG margins:
                // When the bird passes the center x of a pipe pair, check if its
                // center y is within the gap. If yes -> score+1; otherwise -> collision.
                let addedScore = 0;
                let pipeCenterCollision = false;
                const scoredPipes = updatedPipes.map(p => {
                    const pipeCenterX = p.x + Constants.PIPE_WIDTH / 2;
                    const justPassed = !p.scored && pipeCenterX < s.bird.x;
                    if (justPassed) {
                        const gapTop = p.gapY - p.gapHeight / 2;
                        const gapBottom = p.gapY + p.gapHeight / 2;
                        const insideGap =
                            clampedY >= gapTop && clampedY <= gapBottom;
                        if (insideGap) {
                            addedScore += 1;
                        } else {
                            pipeCenterCollision = true;
                        }
                    }
                    return justPassed ? { ...p, scored: true } : p;
                });

                // Collision detection (bird as rectangle)
                const birdX = s.bird.x - Birb.WIDTH / 2;
                const birdY = clampedY - Birb.HEIGHT / 2;
                const birdW = Birb.WIDTH;
                const birdH = Birb.HEIGHT;

                // Screen bounds collision (top/bottom)
                let collided =
                    clampedY <= Birb.HEIGHT / 2 ||
                    clampedY >= Viewport.CANVAS_HEIGHT - Birb.HEIGHT / 2;

                // Pipes collision: use center-line collision result only (avoids PNG margins)
                if (!collided && pipeCenterCollision) collided = true;

                // Handle lives with cooldown
                const nextCooldown = Math.max(0, s.hitCooldown - 1);
                let nextLives = s.lives;
                let nextCooldownOut = nextCooldown;
                if (collided && nextCooldown === 0) {
                    nextLives = Math.max(0, s.lives - 1);
                    nextCooldownOut = Constants.HIT_COOLDOWN_TICKS;
                }

                const newScore = s.score + addedScore;
                const allPassed =
                    newScore >= 20 || scoredPipes.every(p => p.scored);

                const nextState: State = {
                    ...s,
                    gameTime: s.gameTime + 1,
                    bird: {
                        ...s.bird,
                        y: clampedY,
                        velocity: nextLives === 0 ? 0 : newVelocity,
                    },
                    pipes: scoredPipes,
                    lives: nextLives,
                    hitCooldown: nextCooldownOut,
                    damageTicks:
                        collided && nextCooldown === 0
                            ? Constants.DAMAGE_TICKS
                            : Math.max(0, s.damageTicks - 1),
                    score: newScore,
                    gameEnd: nextLives === 0 ? true : s.gameEnd || allPassed,
                    won: nextLives > 0 && allPassed ? true : s.won,
                };

                // Record endTick once when the game ends this frame
                if (!s.gameEnd && nextState.gameEnd) {
                    (window as any).__lastGameEndTick = nextState.gameTime;
                }

                return nextState;
            },
        ),
    );

    // Flap: immediate upward velocity
    const flapReducer$: Observable<Reducer> = flap$.pipe(
        withLatestFrom(tickIndex$),
        share(),
        map(([_, __]) => undefined as unknown as never), // placeholder to keep types simple
    );

    // Ghost support: capture current run's flap ticks
    const currentRunFlapTicks$ = flap$.pipe(
        withLatestFrom(tickIndex$),
        map(([_, i]) => i),
        share(),
    );

    // Player flap reducer (separate from ghost capture)
    const playerFlapReducer$: Observable<Reducer> = flap$.pipe(
        map(
            (): Reducer => (s: State) =>
                s.gameEnd
                    ? s
                    : {
                          ...s,
                          bird: {
                              ...s.bird,
                              velocity: Constants.JUMP_VELOCITY,
                          },
                      },
        ),
    );

    // Accumulate: merge reducer streams and fold over time (scan)
    // Merge player reducers (physics + player flaps)
    const player$ = merge(physics$, playerFlapReducer$).pipe(
        scan((s, reducer) => reducer(s), initialGameState),
    );

    // Build ghost flap streams from all previous runs in this app session
    const allTickLists = (window as any).__allRunFlapTicksArrays as
        | number[][]
        | undefined;
    const ghostStreams: Observable<{ idx: number }>[] = (
        allTickLists || []
    ).map((list, idx) =>
        tickIndex$.pipe(
            filter(i => list.includes(i)),
            map(() => ({ idx })),
        ),
    );
    const ghostFlap$ = ghostStreams.length ? merge(...ghostStreams) : EMPTY;
    const hasGhost = ghostStreams.length > 0;

    // Ghost state: integrate the same physics, driven by ghostFlap$ impulses
    const ghostReducerPhysics$: Observable<Reducer> = hasGhost
        ? tick$.pipe(
              map(
                  (): Reducer => (s: State) => {
                      if (s.gameEnd) return s;
                      const needed = allTickLists ? allTickLists.length : 0;
                      const startArr = (window as any).__allRunStartYs as
                          | number[]
                          | undefined;
                      const endArr = (window as any).__allRunEndTicks as
                          | number[]
                          | undefined;
                      const baseGhosts: Bird[] =
                          s.ghosts && s.ghosts.length
                              ? ([...s.ghosts] as Bird[])
                              : Array.from({ length: needed }, (_, i) => ({
                                    x: s.bird.x,
                                    y:
                                        startArr?.[i] ??
                                        Viewport.CANVAS_HEIGHT / 2,
                                    velocity: 0,
                                }));
                      const nextGhosts = baseGhosts.map((g, i) => {
                          const endTick = endArr?.[i];
                          if (
                              typeof endTick === "number" &&
                              s.gameTime >= endTick
                          ) {
                              // hide corpse for the very first run as well
                              return { ...g, dead: true } as Ghost;
                          }
                          const v = g.velocity + Constants.GRAVITY;
                          const y = clamp(
                              g.y + v,
                              Birb.HEIGHT / 2,
                              Viewport.CANVAS_HEIGHT - Birb.HEIGHT / 2,
                          );
                          return { ...g, y, velocity: v } as Ghost;
                      });
                      return { ...s, ghosts: nextGhosts };
                  },
              ),
          )
        : EMPTY;

    const ghostReducerFlap$: Observable<Reducer> = hasGhost
        ? ghostFlap$.pipe(
              map(({ idx }) => (s: State) => {
                  const needed = allTickLists ? allTickLists.length : 0;
                  const startArr = (window as any).__allRunStartYs as
                      | number[]
                      | undefined;
                  const endArr = (window as any).__allRunEndTicks as
                      | number[]
                      | undefined;
                  const baseGhosts: Ghost[] =
                      s.ghosts && s.ghosts.length
                          ? ([...s.ghosts] as Ghost[])
                          : Array.from({ length: needed }, (_, i) => ({
                                x: s.bird.x,
                                y: startArr?.[i] ?? Viewport.CANVAS_HEIGHT / 2,
                                velocity: 0,
                            }));
                  if (idx >= 0 && idx < baseGhosts.length) {
                      const endTick = endArr?.[idx];
                      if (typeof endTick !== "number" || s.gameTime < endTick) {
                          baseGhosts[idx] = {
                              ...baseGhosts[idx],
                              velocity: Constants.JUMP_VELOCITY,
                          };
                      }
                  }
                  return { ...s, ghosts: baseGhosts };
              }),
          )
        : EMPTY;

    const withGhost$ = merge(
        physics$,
        playerFlapReducer$,
        ghostReducerPhysics$,
        ghostReducerFlap$,
    ).pipe(scan((s, reducer) => reducer(s), initialGameState));

    // Expose current run flap ticks as an array for the next session (accumulate all runs)
    const ticksSub: number[] = [];
    currentRunFlapTicks$.subscribe(t => ticksSub.push(t));
    const allRuns: number[][] =
        ((window as any).__allRunFlapTicksArrays as number[][]) || [];
    // When this observable completes (session will end via outer switchMap cancel),
    // push the collected ticks to the global array on game end path (handled in bootstrap)
    (window as any).__currentRunFlapTicksArray = ticksSub;

    return withGhost$;
};

// The following simply runs your main function on window load.  Make sure to leave it in place.
// You should not need to change this, beware if you are.
if (typeof window !== "undefined") {
    const { protocol, hostname, port } = new URL(import.meta.url);
    const baseUrl = `${protocol}//${hostname}${port ? `:${port}` : ""}`;
    const csvUrl = `${baseUrl}/assets/map.csv`;

    // Get the file from URL
    const csv$ = fromFetch(csvUrl).pipe(
        switchMap(response => {
            if (response.ok) {
                return response.text();
            } else {
                throw new Error(`Fetch error: ${response.status}`);
            }
        }),
        catchError(err => {
            console.error("Error fetching the CSV file:", err);
            throw err;
        }),
    );

    // Draw start screen (background + start button in the main area)
    const svgEl = document.querySelector("#svgCanvas") as SVGSVGElement;
    const drawStartScreen = () => {
        if (!svgEl) return;
        svgEl.innerHTML = "";
        const bg = createSvgElement(svgEl.namespaceURI, "image", {
            href: "../assets/bg.jpg",
            x: "0",
            y: "0",
            width: `${Viewport.CANVAS_WIDTH}`,
            height: `${Viewport.CANVAS_HEIGHT}`,
            preserveAspectRatio: "xMidYMid slice",
        });
        svgEl.appendChild(bg);
        // Dim the scene before game starts
        const dimRect = createSvgElement(svgEl.namespaceURI, "rect", {
            x: "0",
            y: "0",
            width: `${Viewport.CANVAS_WIDTH}`,
            height: `${Viewport.CANVAS_HEIGHT}`,
            fill: "black",
            opacity: "0.45",
        });
        svgEl.appendChild(dimRect);
        const w = 180;
        const h = 60;
        const startBtn = createSvgElement(svgEl.namespaceURI, "image", {
            href: "../assets/start-btn.png",
            x: `${(Viewport.CANVAS_WIDTH - w) / 2}`,
            y: `${Viewport.CANVAS_HEIGHT * 0.5 - h / 2}`,
            width: `${w}`,
            height: `${h}`,
            id: "startBtn",
        });
        svgEl.appendChild(startBtn);
    };
    drawStartScreen();

    // splash: can be skipped by the skip button, 6s then hide
    const splash = document.getElementById("splash") as HTMLElement;
    const game = document.getElementById("main") as HTMLElement;
    const endSplash = () => {
        if (splash) splash.style.display = "none";
        if (game) game.style.display = "block";
    };
    const splashTimeout = window.setTimeout(endSplash, 6000);
    const skipBtn = document.getElementById("skipBtn") as HTMLElement | null;
    if (skipBtn) {
        skipBtn.addEventListener("click", () => {
            clearTimeout(splashTimeout);
            endSplash();
        });
    }

    // Streams: start once, restart many times
    const start$ = fromEvent<MouseEvent>(svgEl, "mousedown").pipe(
        filter(e => (e.target as Element).id === "startBtn"),
        take(1),
    );
    const restart$ = fromEvent<MouseEvent>(svgEl, "mousedown").pipe(
        filter(e => (e.target as Element).id === "replayBtn"),
    );
    const session$ = merge(start$, restart$);

    // Render subscription - pure render only
    csv$.pipe(
        switchMap(contents => session$.pipe(switchMap(() => state$(contents)))),
    ).subscribe(render());

    // Append current run ticks once per session end (dedup to avoid多次追加)
    csv$.pipe(
        switchMap(contents =>
            session$.pipe(
                switchMap(() =>
                    state$(contents).pipe(
                        filter(s => s.gameEnd),
                        take(1),
                        map(
                            () =>
                                (window as any)
                                    .__currentRunFlapTicksArray as number[],
                        ),
                        filter(arr => Array.isArray(arr) && arr.length > 0),
                    ),
                ),
            ),
        ),
    ).subscribe(arr => {
        const all = (window as any).__allRunFlapTicksArrays as
            | number[][]
            | undefined;
        const exists =
            all?.some(
                old =>
                    old.length === arr.length &&
                    old.every((v, i) => v === arr[i]),
            ) ?? false;
        (window as any).__allRunFlapTicksArrays = exists
            ? all
            : all
              ? [...all, arr]
              : [arr];
        // record startY and endTick for ghosts
        const startY = (window as any).__currentRunStartY as number | undefined;
        if (startY !== undefined) {
            const ys =
                ((window as any).__allRunStartYs as number[] | undefined) || [];
            ys.push(startY);
            (window as any).__allRunStartYs = ys;
        }
        const endTick = (window as any).__lastGameEndTick as number | undefined;
        if (endTick !== undefined) {
            const ends =
                ((window as any).__allRunEndTicks as number[] | undefined) ||
                [];
            ends.push(endTick);
            (window as any).__allRunEndTicks = ends;
        }
    });
}
