export function pageParams(query: { page?: unknown; pageSize?: unknown }): {
  page: number;
  pageSize: number;
  skip: number;
} {
  const page = Math.max(1, Number(query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 20));
  return { page, pageSize, skip: (page - 1) * pageSize };
}
