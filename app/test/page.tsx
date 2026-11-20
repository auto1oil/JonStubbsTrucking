import { redirect } from 'next/navigation';

export default function TestHome() {
  redirect('/test/log');
}
