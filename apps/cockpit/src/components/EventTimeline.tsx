import type { TimelineEventView } from "../types.js";
import { Badge } from "./Badge.js";
import { Panel } from "./Panel.js";

export interface EventTimelineProps {
  readonly events: readonly TimelineEventView[];
}

export function EventTimeline({ events }: EventTimelineProps) {
  return (
    <Panel
      title="Event timeline"
      aria-label="Event timeline"
      data-testid="event-timeline"
      meta={events.length > 0 ? `${events.length} events` : undefined}
      padded={false}
    >
      {events.length === 0 ? (
        <p className="panel__empty">No events recorded yet.</p>
      ) : (
        <ol className="timeline-list">
          {events.map((event) => (
            <li key={event.id} className="timeline-row" data-testid={`timeline-event-${event.id}`}>
              <span className="timeline-row__time">{event.occurredAt}</span>
              <span className="timeline-row__kind">[{event.kind}]</span>
              {event.trust === "untrusted" && (
                <Badge tone="danger" data-testid={`untrusted-badge-${event.id}`}>
                  untrusted source
                </Badge>
              )}
              <span className="timeline-row__summary">{event.summary}</span>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}
