import { DescriptorProvider } from "../descriptor-provider"

export const natsProvider = new DescriptorProvider({
  id: "uk-nats-aixm",
  country: "GB",
  authority: "NATS Aeronautical Information Service",
  capabilities: ["permanent"],
  authoritative: true,
  sourceUrl: "https://nats-uk.ead-it.com/cms-nats/opencms/en/Publications/digital-datasets/",
  notes: "Import the current AIRAC UAS Flight Restrictions AIXM 5.1 dataset; retain source version and checksum.",
})
