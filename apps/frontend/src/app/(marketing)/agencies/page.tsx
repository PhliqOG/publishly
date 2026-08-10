import { redirect } from 'next/navigation';

// Superseded by /for-agencies (the GEO-rebuilt agencies page). Kept as a
// redirect so the old route never 404s.
export default function Page() {
  redirect('/for-agencies');
}
