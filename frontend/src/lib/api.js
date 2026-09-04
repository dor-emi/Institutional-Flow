import axios from "axios";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export const api = axios.create({ baseURL: API, timeout: 60000 });

export const getSources = () => api.get("/sources").then((r) => r.data);
export const getDaily = (range) => api.get("/flows/daily", { params: { range } }).then((r) => r.data);
export const getStats = () => api.get("/flows/stats").then((r) => r.data);
export const getIndices = (range) => api.get("/indices", { params: { range } }).then((r) => r.data);
export const getCompare = (index, range) => api.get("/compare", { params: { index, range } }).then((r) => r.data);
export const getSectors = (periods) => api.get("/sectors", { params: { periods } }).then((r) => r.data);
export const getRotation = (periods) => api.get("/sectors/rotation", { params: { periods } }).then((r) => r.data);
export const getHoldings = () => api.get("/holdings").then((r) => r.data);
export const getFpiDeals = (days) => api.get("/deals/fpi", { params: { days } }).then((r) => r.data);
export const postRefresh = () => api.post("/refresh").then((r) => r.data);
export const exportDailyUrl = (range) => `${API}/export/daily.csv?range=${range}`;
export const exportSectorsUrl = () => `${API}/export/sectors.csv`;
