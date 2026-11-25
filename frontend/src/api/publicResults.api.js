import { api } from "./axios";

export const searchPublishedResultApi = async (payload) => {
  const response = await api.post("/public-results/search", payload);
  return response.data;
};

export const getPublishedResultHistoryApi = async (payload) => {
  const response = await api.post("/public-results/history/search", payload);
  return response.data;
};

export const downloadPublishedResultPdfApi = async (payload) => {
  const response = await api.post("/public-results/download-pdf", payload, {
    responseType: "blob"
  });
  return response.data;
};