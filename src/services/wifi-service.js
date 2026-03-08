import { summarizeVotes } from "../confidence.js";

export function createWifiService({
  locationsRepository,
  wifiDetailsRepository,
  votesRepository
}) {
  return {
    createWifiDetail(locationId, payload) {
      if (!locationsRepository.findActiveById(locationId)) {
        return null;
      }

      return wifiDetailsRepository.create(locationId, payload);
    },

    upsertVote({ wifiDetailId, voterTokenHash, voteType }) {
      if (!wifiDetailsRepository.findActiveById(wifiDetailId)) {
        return null;
      }

      return votesRepository.upsert({ wifiDetailId, voterTokenHash, voteType });
    },

    getWifiSummary(wifiDetailId) {
      if (!wifiDetailsRepository.findActiveById(wifiDetailId)) {
        return null;
      }

      return summarizeVotes(votesRepository.listByWifiDetailId(wifiDetailId));
    }
  };
}
