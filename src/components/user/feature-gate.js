import { isFeatureEnabled } from "@/lib/features";
import { Panel, PortalHeading } from "@/components/user/portal-ui";

export default async function FeatureGate({ feature, title, description, children }) {
  const enabled = await isFeatureEnabled(feature);
  if (enabled) return <>{children}</>;
  return (
    <div className="space-y-6">
      <PortalHeading title={title || "Feature unavailable"} description={description || "This feature is currently disabled by the platform team."} />
      <Panel>
        <p className="text-sm leading-6 text-[#61736e]">This section is turned off. Contact KURO support if you need access.</p>
      </Panel>
    </div>
  );
}
