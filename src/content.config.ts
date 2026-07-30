import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const partners = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/partners' }),
  schema: z.object({
    name: z.string(),
    title: z.string(),
    organization: z.string(),
    location: z.string(),
    bio: z.string(),
    photo: z.string().optional(),
    website: z.string().url().optional(),
    linkedin: z.string().url().optional(),
    education: z.string().optional(),
    order: z.number().default(0),
  }),
});

const resources = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/resources' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    category: z.enum(['guide', 'worksheet', 'research', 'toolkit']),
    downloadUrl: z.string(),
    featured: z.boolean().default(false),
    hidden: z.boolean().default(false),
    publishDate: z.coerce.date(),
  }),
});

const webinars = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/webinars' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    presenter: z.string(),
    duration: z.string().optional(),
    eventDate: z.coerce.date().optional(),
    eventTimeDisplay: z.string().optional(),
    eventStartISO: z.string().optional(),
    eventEndISO: z.string().optional(),
    image: z.string().optional(),
    heroImage: z.string().optional(),
    price: z.number(),
    stripePaymentLink: z.string(),
    stripeBuyButtonId: z.string().optional(),
    topics: z.array(z.string()),
    featured: z.boolean().default(false),
    hidden: z.boolean().default(false),
    // --- Recording (for past webinars sold on demand) ---
    recordingAvailable: z.boolean().default(false),
    recordingPrice: z.number().optional(),
    stripeRecordingLink: z.string().optional(),
    recordingEmbedUrl: z.string().optional(),
  }),
});

const blog = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/blog' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    author: z.string().default('Jarin Wadiwalla'),
    publishDate: z.coerce.date(),
    image: z.string().optional(),
    featured: z.boolean().default(false),
  }),
});

export const collections = { partners, resources, webinars, blog };
