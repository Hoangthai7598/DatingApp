import type { NextConfig } from "next";

// GitHub Pages phục vụ trang ở /<tên-repo>/ — workflow truyền giá trị này qua PAGES_BASE_PATH.
const basePath = process.env.PAGES_BASE_PATH ?? "";

const nextConfig: NextConfig = {
  output: "export",
  basePath,
  // The page fetches /showtimes.json and needs to know the base path at runtime.
  env: { NEXT_PUBLIC_BASE_PATH: basePath },
  trailingSlash: true,
  images: { unoptimized: true },
};

export default nextConfig;
