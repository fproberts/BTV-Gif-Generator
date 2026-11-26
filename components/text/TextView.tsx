'use client';

import { useEffect, useMemo, useState } from 'react';
import { ListPlus, Loader2, Play, Save, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { LedText } from '@/components/led/LedMatrix';
import { useScreen } from '@/components/app/useScreen';
import { useLibrary } from '@/components/app/LibraryContext';
import { AddToPlaylist } from '@/components/app/AddToPlaylist';
import { saveTextConfig, deleteTextConfig, touchTextConfig } from '@/app/textLibraryActions';
import { DEFAULT_STUDIO, pickPortable, portableEqual, type PortableStudio } from '@/lib/ipixel/studio';
import { COLOUR_SWATCHES, FONT_CHOICES } from '@/lib/ipixel/presets';
import { TEXT_EFFECTS } from '@/lib/ipixel/protocol';
import { textItem } from '@/lib/playlist/model';

const DRAFT_KEY = 'bb.textDraft.v1';
const FONTS = FONT_CHOICES.filter((f) => f.id !== 'custom').map((f) => ({ ...f, label: f.label.replace(/\s*\(.*\)$/, '').replace(' / Helvetica', '') }));

function loadDraft(): PortableStudio {
    const base = pickPortable(DEFAULT_STUDIO);
    try {
        const raw = window.localStorage.getItem(DRAFT_KEY);
        return raw ? { ...base, ...JSON.parse(raw) } : { ...base, text: '' };
    } catch {
        return { ...base, text: '' };
    }
}

const num = (v: number | readonly number[]) => (Array.isArray(v) ? v[0] : (v as number));

export function TextView() {
    const { texts, setTexts, adminPassword, online } = useLibrary();
    const { play, busy } = useScreen();
    const [t, setT] = useState<PortableStudio>(() => pickPortable(DEFAULT_STUDIO));
    const [loaded, setLoaded] = useState(false);
    const [savedId, setSavedId] = useState<string | null>(null);
    const [naming, setNaming] = useState(false);
    const [name, setName] = useState('');
    const [saving, setSaving] = useState(false);
    const [adding, setAdding] = useState(false);

    useEffect(() => {
        setT(loadDraft());
        setLoaded(true);
    }, []);
    useEffect(() => {
        if (!loaded) return;
        try {
            window.localStorage.setItem(DRAFT_KEY, JSON.stringify(t));
        } catch {
            /* ignore */
        }
    }, [t, loaded]);

    const set = <K extends keyof PortableStudio>(k: K, v: PortableStudio[K]) => setT((p) => ({ ...p, [k]: v }));
    const savedMatch = useMemo(() => texts.find((x) => portableEqual(x.config, t)), [texts, t]);
    const empty = !t.text.trim();

    const showNow = async () => {
        const ok = await play([textItem(t.text, t)], 'your text');
        if (ok && savedMatch) touchTextConfig(savedMatch.id).catch(() => {});
    };

    const save = async () => {
        const n = name.trim();
        if (!n) return;
        setSaving(true);
        try {
            const res = await saveTextConfig({ id: savedId ?? undefined, name: n, config: t });
            if (!res.ok) {
                toast.error(res.error);
                return;
            }
            const item = res.value.item;
            setTexts((all) => [item, ...all.filter((x) => x.id !== item.id && !res.value.evicted.some((e) => e.id === x.id))]);
            setSavedId(item.id);
            setNaming(false);
            toast.success(`Saved “${item.name}”`);
        } catch {
            toast.error('Couldn’t save', { description: online ? 'Try again in a moment.' : 'Saving to the shared list needs signal. You can still add it to a playlist.' });
        } finally {
            setSaving(false);
        }
    };

    const remove = async (id: string) => {
        if (!adminPassword) return;
        const res = await deleteTextConfig(id, adminPassword);
        if (res.ok) setTexts((all) => all.filter((x) => x.id !== id));
        else toast.error(res.error);
    };

    return (
        <section className="mx-auto max-w-2xl px-4 py-5">
            <h1 className="mb-4 text-2xl font-semibold">Text</h1>

            <LedText text={t} className="mb-4" />

            <Textarea
                value={t.text}
                onChange={(e) => {
                    set('text', e.target.value.slice(0, 300));
                    setSavedId(null);
                }}
                placeholder="Type a message"
                rows={2}
                className="min-h-0 resize-none text-base"
                aria-label="Message"
            />

            <div className="mt-5 space-y-5">
                <fieldset>
                    <legend className="mb-2 text-sm">Colour</legend>
                    <div className="flex items-center gap-2.5">
                        {COLOUR_SWATCHES.map((c) => (
                            <button
                                key={c.color}
                                type="button"
                                aria-label={c.name}
                                aria-pressed={t.color.toUpperCase() === c.color}
                                onClick={() => set('color', c.color)}
                                className={cn(
                                    'size-8 rounded-full border-2 border-transparent ring-offset-2 ring-offset-background',
                                    t.color.toUpperCase() === c.color && 'ring-2 ring-foreground',
                                )}
                                style={{ backgroundColor: `#${c.color}` }}
                            />
                        ))}
                        <label className="relative size-8 cursor-pointer overflow-hidden rounded-full border border-border" aria-label="Custom colour">
                            <input
                                type="color"
                                value={`#${t.color}`}
                                onChange={(e) => set('color', e.target.value.slice(1).toUpperCase())}
                                className="absolute inset-0 size-full cursor-pointer opacity-0"
                            />
                            <span className="block size-full" style={{ background: 'conic-gradient(red, yellow, lime, cyan, blue, magenta, red)' }} />
                        </label>
                    </div>
                </fieldset>

                <fieldset>
                    <legend className="mb-2 text-sm">Movement</legend>
                    <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
                        {TEXT_EFFECTS.map((e) => (
                            <button
                                key={e.id}
                                type="button"
                                onClick={() => set('effect', e.id)}
                                aria-pressed={t.effect === e.id}
                                className={cn(
                                    'h-9 shrink-0 rounded-full border px-3.5 text-sm transition-colors',
                                    t.effect === e.id ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground hover:text-foreground',
                                )}
                            >
                                {e.label}
                            </button>
                        ))}
                    </div>
                </fieldset>

                <div>
                    <div className="mb-3 flex justify-between text-sm">
                        <span>Speed</span>
                    </div>
                    <Slider min={0} max={255} step={5} value={[t.speed]} onValueChange={(v) => set('speed', num(v))} aria-label="Speed" />
                </div>

                <div className="grid grid-cols-[1fr_auto] items-end gap-4">
                    <label className="text-sm">
                        <span className="mb-2 block">Font</span>
                        <select
                            value={t.fontId}
                            onChange={(e) => {
                                const f = FONTS.find((x) => x.id === e.target.value);
                                setT((p) => ({ ...p, fontId: e.target.value, weight: f?.weight ?? p.weight }));
                            }}
                            className="h-10 w-full rounded-md border border-input bg-input/30 px-2"
                        >
                            {FONTS.map((f) => (
                                <option key={f.id} value={f.id}>{f.label}</option>
                            ))}
                        </select>
                    </label>
                    <div className="w-36 text-sm">
                        <span className="mb-3 flex justify-between">
                            <span>Size</span>
                            <span className="tabular-nums text-muted-foreground">{t.sizePx}</span>
                        </span>
                        <Slider min={8} max={24} step={1} value={[t.sizePx]} onValueChange={(v) => set('sizePx', num(v))} aria-label="Size" />
                    </div>
                </div>
            </div>

            <div className="sticky bottom-[calc(4rem+env(safe-area-inset-bottom))] z-20 -mx-4 mt-6 flex gap-2 bg-background/95 px-4 py-3 backdrop-blur">
                <Button
                    variant="secondary"
                    size="icon-lg"
                    className="size-11"
                    aria-label="Save text"
                    disabled={empty}
                    onClick={() => {
                        setName(savedMatch?.name ?? t.text.slice(0, 40));
                        setNaming(true);
                    }}
                >
                    <Save />
                </Button>
                <Button variant="secondary" size="lg" className="h-11 flex-1" disabled={empty} onClick={() => setAdding(true)}>
                    <ListPlus /> Add to playlist
                </Button>
                <Button size="lg" className="h-11 flex-1" disabled={empty || busy} onClick={showNow}>
                    {busy ? <Loader2 className="animate-spin" /> : <Play />} Show now
                </Button>
            </div>

            <h2 className="mt-8 mb-3 text-lg font-medium">Saved</h2>
            {texts.length === 0 ? (
                <p className="text-sm text-muted-foreground">Texts you save appear here for everyone.</p>
            ) : (
                <ul className="space-y-2">
                    {texts.map((x) => (
                        <li key={x.id} className="flex items-center gap-3 rounded-xl border border-border bg-card p-2">
                            <button
                                type="button"
                                className="flex min-w-0 flex-1 items-center gap-3 text-left"
                                onClick={() => {
                                    setT(x.config);
                                    setSavedId(x.id);
                                    window.scrollTo({ top: 0, behavior: 'smooth' });
                                }}
                            >
                                <LedText text={x.config} animate={false} className="w-28 shrink-0" />
                                <span className="truncate">{x.name}</span>
                            </button>
                            {adminPassword && (
                                <Button variant="ghost" size="icon" aria-label={`Delete ${x.name}`} onClick={() => remove(x.id)}>
                                    <Trash2 />
                                </Button>
                            )}
                        </li>
                    ))}
                </ul>
            )}

            <Dialog open={naming} onOpenChange={setNaming}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Save text</DialogTitle>
                    </DialogHeader>
                    <Input
                        autoFocus
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && save()}
                        placeholder="Name"
                        className="h-10"
                        maxLength={60}
                    />
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setNaming(false)}>Cancel</Button>
                        <Button onClick={save} disabled={!name.trim() || saving}>
                            {saving && <Loader2 className="animate-spin" />} Save
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <AddToPlaylist items={() => [textItem(t.text, t)]} open={adding} onOpenChange={setAdding} />
        </section>
    );
}
