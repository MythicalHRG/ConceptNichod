import { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: ['/', '/changelog', '/donate', '/profile/'],
      disallow: ['/dashboard/', '/api/', '/auth/'],
    },
    sitemap: 'https://conceptnichod.com/sitemap.xml',
  };
}
