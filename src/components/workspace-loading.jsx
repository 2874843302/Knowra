import { Button } from "../design/primitives";

const pageShapes = [
  "M140 91C166 74 195 70 223 80L223 154C194 144 166 146 140 163Z",
  "M140 91C167 57 179 45 185 38L185 121C169 132 155 147 140 163Z",
  "M140 91C135 48 124 28 118 24L113 112C127 132 135 149 140 163Z",
  "M140 91C115 70 82 66 57 80L57 154C84 144 114 146 140 163Z",
  "M140 91C115 70 82 66 57 80L57 154C84 144 114 146 140 163Z",
].join(";");

function TurningPage({ secondary = false, paused }) {
  return (
    <path
      className={`opening-turn-page ${secondary ? "secondary" : "primary"}`}
      d="M140 91C166 74 195 70 223 80L223 154C194 144 166 146 140 163Z"
      fill={secondary ? "#dcebe8" : "#fffdf9"}
      stroke={secondary ? "#85aaa8" : "#4a6fa5"}
      strokeWidth={secondary ? "1.6" : "2"}
    >
      {!paused && (
        <>
          <animate
            attributeName="d"
            values={pageShapes}
            keyTimes="0;0.28;0.52;0.88;1"
            dur="1.05s"
            begin={secondary ? "-0.53s" : "-0.08s"}
            repeatCount="indefinite"
          />
          <animate
            attributeName="fill"
            values={
              secondary
                ? "#dcebe8;#c4d9db;#f4f5ef;#dcebe8"
                : "#fffdf9;#e1eaf0;#fffdf9;#fffdf9"
            }
            keyTimes="0;0.42;0.88;1"
            dur="1.05s"
            begin={secondary ? "-0.53s" : "-0.08s"}
            repeatCount="indefinite"
          />
        </>
      )}
    </path>
  );
}

export function WorkspaceLoading({ stage = "account", error, onRetry }) {
  return (
    <main
      className={`workspace-loading workspace-opening ${error ? "has-error" : ""}`}
      aria-busy={!error}
    >
      <div className="opening-illustration" aria-hidden="true">
        <div className="opening-wash" />
        <svg viewBox="0 0 280 220" fill="none">
          <ellipse
            className="opening-shadow"
            cx="140"
            cy="178"
            rx="66"
            ry="8"
          />
          <g
            className="opening-book"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path
              d="M49 89Q94 72 140 96Q186 72 231 89V163Q186 151 140 173Q94 151 49 163Z"
              fill="#d9e4e7"
              stroke="#4a6fa5"
              strokeWidth="2"
            />
            <path
              d="M57 80Q99 66 140 91V163Q101 144 57 154Z"
              fill="#fffdf9"
              stroke="#7090b8"
              strokeWidth="1.5"
            />
            <path
              d="M140 91Q181 66 223 80V154Q179 144 140 163Z"
              fill="#fffdf9"
              stroke="#7090b8"
              strokeWidth="1.5"
            />
            <path d="M140 94V166" stroke="#4a6fa5" strokeWidth="1.5" />
            <g className="opening-ink" stroke="#8fa5bc" strokeWidth="2">
              <path d="M74 99Q98 96 122 106M74 111Q98 108 122 118M74 123Q91 121 107 126" />
              <path d="M158 106Q181 96 205 99M158 118Q181 108 205 111M173 125Q190 121 205 123" />
            </g>
            <TurningPage secondary paused={Boolean(error)} />
            <TurningPage paused={Boolean(error)} />
          </g>
          <g className="opening-idea" transform="translate(90 -2)">
            <path
              d="M129 41a15 15 0 1 1 22 0l-3 5h-16Z"
              fill="#f3dfad"
              fillOpacity=".7"
              stroke="#bb9865"
              strokeWidth="1.5"
            />
            <path
              d="M134 51h12m-10 5h8M140 10V5m-27 18-5-2m59 2 5-2"
              stroke="#bb9865"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </g>
          <circle
            className="opening-seed seed-one"
            cx="67"
            cy="53"
            r="4"
            fill="#85cdca"
          />
          <circle
            className="opening-seed seed-two"
            cx="251"
            cy="74"
            r="3"
            fill="#e8a87c"
          />
        </svg>
      </div>
      <div className="opening-copy">
        <h1>
          知序 <span>Knowra</span>
        </h1>
        {error ? (
          <p role="alert">{error}</p>
        ) : (
          <p role="status">
            {stage === "account"
              ? "正在确认登录状态"
              : "正在同步课程与学习记录"}
            <span className="opening-dots" aria-hidden="true">
              …
            </span>
          </p>
        )}
        {!error && (
          <span className="opening-subtitle">让好奇，慢慢长成知识。</span>
        )}
        {error && onRetry && (
          <Button variant="primary" onClick={onRetry}>
            重新连接
          </Button>
        )}
      </div>
    </main>
  );
}
