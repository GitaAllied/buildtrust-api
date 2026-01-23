import { z } from 'zod';

export const updateProfileSchema = z.object({
  name: z.string().min(1).optional(),
  bio: z.string().optional(),
  phone: z.string().optional(),
  location: z.string().optional(),
  preferred_contact: z.string().optional(),
  company_type: z.string().optional(),
  years_experience: z.union([z.string().regex(/^\d+$/).transform(Number), z.number()]).optional(),
  project_types: z.union([z.array(z.string()), z.string()]).optional(),
  preferred_cities: z.union([z.array(z.string()), z.string()]).optional(),
  budget_range: z.string().optional(),
  working_style: z.string().optional(),
  availability: z.string().optional(),
  specializations: z.union([z.array(z.string()), z.string()]).optional(),
  languages: z.union([z.array(z.string()), z.string()]).optional(),
  setup_completed: z.boolean().optional(),
});

export const uploadDocumentSchema = z.object({
  type: z.enum(['identity', 'license', 'certification', 'testimonial']),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string()
    .min(6, 'New password must be at least 6 characters')
    .regex(/[A-Z]/, 'Password must contain at least one capital letter')
    .regex(/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>\/?]/, 'Password must contain at least one special character'),
  confirmPassword: z.string().min(1, 'Please confirm your new password'),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});
