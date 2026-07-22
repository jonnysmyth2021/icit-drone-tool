import { DescriptorProvider } from "../descriptor-provider"
export const airportsProvider = new DescriptorProvider({ id: "uk-airports", country: "GB", authority: "CAA / NATS AIS / aerodrome operators", capabilities: ["permanent", "infrastructure"], authoritative: true })
