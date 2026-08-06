import { useState } from 'react';
import { useInvalidateAll } from '../hooks/queries';
import { KpiRow } from '../components/dashboard/KpiRow';
import { LivePipeline } from '../components/dashboard/LivePipeline';
import { EventComposer } from '../components/dashboard/EventComposer';
import { ActivityStream } from '../components/dashboard/ActivityStream';
import { ConsumerSimulator } from '../components/dashboard/ConsumerSimulator';
import { DeadLetterPanel } from '../components/dashboard/DeadLetterPanel';
import { EventDetailDrawer } from '../components/events/EventDetailDrawer';
import { DemoRunner } from '../components/demo/DemoRunner';

export function Dashboard() {
  const invalidate = useInvalidateAll();
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      <DemoRunner onChange={invalidate} />

      <KpiRow />

      <LivePipeline selectedId={selectedEventId} onSelect={setSelectedEventId} />

      <div className="grid items-start gap-4 lg:grid-cols-3">
        <EventComposer onIngested={invalidate} />

        <div className="space-y-4">
          <ConsumerSimulator onChange={invalidate} />
          <DeadLetterPanel onChange={invalidate} />
        </div>

        <div className="lg:h-[640px]">
          <ActivityStream onSelect={setSelectedEventId} />
        </div>
      </div>

      <EventDetailDrawer eventId={selectedEventId} onClose={() => setSelectedEventId(null)} />
    </div>
  );
}
