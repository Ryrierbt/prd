declare module "app-store-scraper" {
  const store: {
    app(options: Record<string, unknown>): Promise<unknown>;
    search(options: Record<string, unknown>): Promise<unknown>;
    reviews(options: Record<string, unknown>): Promise<unknown>;
    ratings(options: Record<string, unknown>): Promise<unknown>;
    sort: { RECENT: string; HELPFUL: string };
  };

  export default store;
}
