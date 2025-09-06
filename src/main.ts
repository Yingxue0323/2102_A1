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
    JUMP_VELOCITY: -7,
    TICK_RATE_MS: 30,
} as const;

// User input

type Key = "Space";

// State processing

type Bird = Readonly<{
    x: number;
    y: number;
    velocity: number;
}>;

type Pipe = Readonly<{
    id: number;
    x: number;
    gapY: number;
    gapHeight: number;
    time: number;
}>;

type State = Readonly<{
    gameEnd: boolean;
    bird: Bird;
    pipes: readonly Pipe[];
    lives: number;
    score: number;
    gameTime: number;
}>;

const initialState: State = {
    gameEnd: false,
    bird: {
        x: Viewport.CANVAS_WIDTH * 0.3,
        y: Viewport.CANVAS_HEIGHT / 2,
        velocity: 0,
    },
    pipes: [],
    lives: 3,
    score: 0,
    gameTime: 0,
};

/** Utility: clamp value to [min, max] */
const clamp = (value: number, min: number, max: number): number =>
    Math.max(min, Math.min(max, value));

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
            href: "assets/bg.jpg",
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
                        href: "assets/pipe.png",
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
                            href: "assets/pipe.png",
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

        // Add bird
        const birdImg = createSvgElement(svg.namespaceURI, "image", {
            href: "assets/birb.png",
            x: `${s.bird.x - Birb.WIDTH / 2}`,
            y: `${s.bird.y - Birb.HEIGHT / 2}`,
            width: `${Birb.WIDTH}`,
            height: `${Birb.HEIGHT}`,
        });
        svg.appendChild(birdImg);

        // Update UI
        if (livesText) livesText.textContent = s.lives.toString();
        if (scoreText) scoreText.textContent = s.score.toString();

        // Show game over if needed
        if (s.gameEnd) {
            show(gameOver);
        } else {
            hide(gameOver);
        }
    };
};

export const state$ = (csvContents: string): Observable<State> => {
    // keydown event
    const key$ = fromEvent<KeyboardEvent>(document, "keydown");
    const flap$ = key$.pipe(filter(({ code }) => code === "Space"));

    const tick$ = interval(Constants.TICK_RATE_MS); // time step interval: 30ms

    // Parse pipe data from CSV
    const pipeData = parsePipeData(csvContents);

    // Initialize state with pipe data
    const initialGameState: State = {
        ...initialState,
        pipes: pipeData,
    };

    type Reducer = (s: State) => State;

    // Physics tick: gravity integration, position update, pipe scrolling.
    const physics$: Observable<Reducer> = tick$.pipe(
        map(
            (): Reducer => (s: State) => {
                const newVelocity = s.bird.velocity + Constants.GRAVITY;
                const newY = s.bird.y + newVelocity;

                // Clamp bird within screen
                const clampedY = clamp(
                    newY,
                    Birb.HEIGHT / 2,
                    Viewport.CANVAS_HEIGHT - Birb.HEIGHT / 2,
                );

                const updatedPipes = s.pipes
                    .map(pipe => ({
                        ...pipe,
                        x: pipe.x - Constants.PIPE_SPEED,
                    }))
                    .filter(pipe => pipe.x > -Constants.PIPE_WIDTH);

                return {
                    ...s,
                    gameTime: s.gameTime + 1,
                    bird: { ...s.bird, y: clampedY, velocity: newVelocity },
                    pipes: updatedPipes,
                };
            },
        ),
    );

    // Flap: immediate upward velocity
    const flapReducer$: Observable<Reducer> = flap$.pipe(
        map(
            (): Reducer => (s: State) => ({
                ...s,
                bird: { ...s.bird, velocity: Constants.JUMP_VELOCITY },
            }),
        ),
    );

    // Accumulate: merge reducer streams and fold over time (scan)
    return merge(physics$, flapReducer$).pipe(
        scan((s, reducer) => reducer(s), initialGameState),
    );
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

    // Observable: wait for first user click
    const click$ = fromEvent(document.body, "mousedown").pipe(take(1));

    csv$.pipe(
        switchMap(contents =>
            // On click - start the game
            click$.pipe(switchMap(() => state$(contents))),
        ),
    ).subscribe(render());
}
