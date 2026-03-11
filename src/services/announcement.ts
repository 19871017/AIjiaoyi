const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';

export async function getAnnouncements() {
  const response = await fetch(`${API_BASE_URL}/announcements`);
  const result = await response.json();
  if (result.code !== 0) {
    throw new Error(result.message || '获取公告失败');
  }
  return result.data;
}
