const STORAGE_KEY = 'aptiquiz-host-access-token';

export const getHostAccessToken = () => sessionStorage.getItem(STORAGE_KEY);
export const setHostAccessToken = (accessToken) => sessionStorage.setItem(STORAGE_KEY, accessToken);
export const clearHostAccessToken = () => sessionStorage.removeItem(STORAGE_KEY);
export const hasHostAccessToken = () => Boolean(getHostAccessToken());
