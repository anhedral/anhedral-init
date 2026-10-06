import type { Snapshot, Project } from "../server/status.js";
import { Icon, Panel, Empty } from "./components.js";
type FullSnapshot = Extract<Snapshot, { project: Project }>;
type Props = {
  delivery: FullSnapshot["delivery"];
  navigateProvider: (value: string) => void;
  request: (text: string) => Promise<void>;
  context: string;
};
export function Delivery({
  delivery,
  navigateProvider,
  request,
  context,
}: Props) {
  return (
    <>
      <div className="status-banner">
        <Icon name="readiness" />
        <div>
          <h3>Release readiness requires evidence.</h3>
          <p>
            CI results and available infrastructure are inputs to a release
            decision. This panel does not claim production readiness.
          </p>
        </div>
      </div>
      <Panel title="Recent workflow runs" description={delivery?.detail}>
        {delivery?.runs.length ? (
          delivery.runs.map(
            (
              run: {
                name: string;
                date: string;
                status: string;
                url: string;
              },
              index: number,
            ) => (
              <div className="check-row" key={index}>
                <Icon name="delivery" />
                <div>
                  <strong>{run.name}</strong>
                  <p>{new Date(run.date).toLocaleString()}</p>
                </div>
                <span className={`run-status ${run.status}`}>
                  {run.status.replaceAll("_", " ")}
                </span>
                <button
                  className="icon-button"
                  aria-label={`Open ${run.name}`}
                  onClick={() => navigateProvider(run.url)}
                >
                  <Icon name="arrow" />
                </button>
              </div>
            ),
          )
        ) : (
          <Empty title="No delivery evidence loaded">
            Set the repository in Settings, then refresh to retrieve recent
            GitHub Actions runs.
          </Empty>
        )}
      </Panel>
      <button
        className="button primary"
        onClick={() =>
          request(
            `${context} Review release readiness, required checks, security, approvals, rollback, and deployed acceptance evidence before proposing a release.`,
          )
        }
      >
        Review delivery with Anhedral <Icon name="arrow" />
      </button>
    </>
  );
}
