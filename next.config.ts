import type { NextConfig } from "next";

// GitHub Pages phục vụ trang ở /<tên-repo>/ — workflow truyền giá trị này qua PAGES_BASE_PATH.
const basePath = process.env.PAGES_BASE_PATH ?? "";

const nextConfig: NextConfig = {
  output: "export",
  basePath,
  trailingSlash: true,
  images: { unoptimized: true },
};

export default nextConfig;
