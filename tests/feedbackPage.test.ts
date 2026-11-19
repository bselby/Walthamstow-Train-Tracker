import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const html = (name: string) => readFileSync(resolve(__dirname, '../public', name), 'utf8');

describe('feedback page', () => {
  let doc: Document;
  let form: HTMLFormElement;
  beforeAll(() => {
    doc = new DOMParser().parseFromString(html('feedback.html'), 'text/html');
    form = doc.querySelector('form')!;
  });

  it('is a Netlify form that posts to the thank-you page', () => {
    expect(form.getAttribute('name')).toBe('feedback');
    expect(form.getAttribute('method')).toBe('POST');
    expect(form.hasAttribute('data-netlify')).toBe(true);
    expect(form.getAttribute('action')).toBe('/thanks.html');
    // Netlify needs the form name in the posted body too.
    const formName = form.querySelector<HTMLInputElement>('input[name="form-name"]')!;
    expect(formName.type).toBe('hidden');
    expect(formName.value).toBe('feedback');
  });

  it('has a hidden trap field for bots', () => {
    const trap = form.getAttribute('netlify-honeypot');
    expect(trap).toBeTruthy();
    const field = form.querySelector(`[name="${trap}"]`)!;
    expect(field.closest('[hidden]')).not.toBeNull();
  });

  it('asks what it is about, the message (required) and an optional email', () => {
    const about = Array.from(form.querySelectorAll<HTMLInputElement>('input[name="about"]')).map((i) => i.value);
    expect(about).toEqual(['feedback', 'spot']);
    expect(form.querySelector<HTMLInputElement>('input[name="about"][value="feedback"]')!.checked).toBe(true);
    const message = form.querySelector<HTMLTextAreaElement>('textarea[name="message"]')!;
    expect(message.required).toBe(true);
    expect(doc.querySelector(`label[for="${message.id}"]`)).not.toBeNull();
    const email = form.querySelector<HTMLInputElement>('input[name="email"]')!;
    expect(email.type).toBe('email');
    expect(email.required).toBe(false);
  });

  it('says spots are visited before they are added, and links to the privacy note', () => {
    expect(doc.body.textContent).toMatch(/visit every spot/i);
    expect(doc.querySelector('a[href="/privacy.html#feedback"]')).not.toBeNull();
  });

  it('has no exclamation marks and says "spot", not "viewpoint"', () => {
    for (const page of ['feedback.html', 'thanks.html']) {
      const text = new DOMParser().parseFromString(html(page), 'text/html').body.textContent ?? '';
      expect(text).not.toMatch(/!/);
      expect(text).not.toMatch(/viewpoint/i);
    }
  });
});

describe('privacy page', () => {
  it('explains the feedback form under #feedback', () => {
    const doc = new DOMParser().parseFromString(html('privacy.html'), 'text/html');
    const section = doc.getElementById('feedback')!;
    expect(section).not.toBeNull();
    expect(section.textContent).toMatch(/Netlify/);
  });
});
