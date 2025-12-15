'use server';

import { createClient } from '@/utils/supabase/server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';

export async function login(formData: FormData) {
  const email = formData.get('email');
  const password = formData.get('password');

  if (typeof email !== 'string' || typeof password !== 'string') {
    return { error: 'Invalid form submission.' };
  }

  const supabase = await createClient();

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    // You can change this to redirect with a query param if you prefer:
    // redirect(`/login?error=${encodeURIComponent(error.message)}`);
    return { error: error.message };
  }

  // Revalidate root layout so any auth-aware UI updates
  await revalidatePath('/', 'layout');

  // If you want to support a dynamic returnUrl, you could read it from formData as well.
  redirect('/dashboard');
}

export async function signup(formData: FormData) {
  const email = formData.get('email');
  const password = formData.get('password');

  if (typeof email !== 'string' || typeof password !== 'string') {
    return { error: 'Invalid form submission.' };
  }

  const supabase = await createClient();

  const { error } = await supabase.auth.signUp({
    email,
    password,
  });

  if (error) {
    return { error: error.message };
  }

  // After signup you might want to send them to a verification page,
  // login page, or directly to the dashboard depending on your flow.
  await revalidatePath('/', 'layout');
  redirect('/dashboard');
}


