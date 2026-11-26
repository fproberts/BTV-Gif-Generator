'use client';

import { Play, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Drawer, DrawerContent, DrawerFooter, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { LedItem } from '@/components/led/LedMatrix';
import { MIN_ITEM_SECONDS, itemTitle, type PlaylistItem } from '@/lib/playlist/model';

const SPEEDS = { min: 6, max: 40 };

function Row({ label, value, children }: { label: string; value?: string; children: React.ReactNode }) {
    return (
        <div className="space-y-3">
            <div className="flex items-baseline justify-between text-sm">
                <span>{label}</span>
                {value && <span className="tabular-nums text-muted-foreground">{value}</span>}
            </div>
            {children}
        </div>
    );
}

const num = (v: number | readonly number[]) => (Array.isArray(v) ? v[0] : (v as number));

export function ItemDrawer({ item, onChange, onRemove, onShowNow, onClose }: {
    item: PlaylistItem | null;
    onChange: (item: PlaylistItem) => void;
    onRemove: () => void;
    onShowNow: () => void;
    onClose: () => void;
}) {
    return (
        <Drawer open={item !== null} onOpenChange={(o) => !o && onClose()}>
            <DrawerContent className="mx-auto max-w-2xl">
                {item && (
                    <>
                        <DrawerHeader className="pb-2">
                            <DrawerTitle className="truncate">{itemTitle(item)}</DrawerTitle>
                        </DrawerHeader>
                        <div className="space-y-6 overflow-y-auto px-4 pb-2">
                            <LedItem item={item} />

                            {(item.kind === 'scroll' || item.kind === 'strip') && (
                                <Row label="Speed" value={`${item.pxPerSecond} px/s`}>
                                    <Slider
                                        min={SPEEDS.min}
                                        max={SPEEDS.max}
                                        step={2}
                                        value={[item.pxPerSecond]}
                                        onValueChange={(v) => onChange({ ...item, pxPerSecond: num(v) })}
                                    />
                                </Row>
                            )}

                            {item.kind === 'scroll' && (
                                <label className="flex items-center justify-between gap-4 text-sm">
                                    <span>
                                        Loop
                                        <span className="block text-muted-foreground">Bottom flows back into the top, no pause</span>
                                    </span>
                                    <Switch checked={item.endless} onCheckedChange={(c) => onChange({ ...item, endless: c })} />
                                </label>
                            )}

                            {item.kind === 'still' && (
                                <>
                                    <Row label="Show for" value={`${Math.max(MIN_ITEM_SECONDS, item.seconds)} s`}>
                                        <Slider
                                            min={MIN_ITEM_SECONDS}
                                            max={60}
                                            step={1}
                                            value={[Math.max(MIN_ITEM_SECONDS, item.seconds)]}
                                            onValueChange={(v) => onChange({ ...item, seconds: num(v) })}
                                        />
                                    </Row>
                                    <Row label="Framing">
                                        <ToggleGroup
                                            variant="outline"
                                            className="w-full"
                                            value={[item.fit]}
                                            onValueChange={(v: unknown[]) => v[0] && onChange({ ...item, fit: v[0] as 'cover' | 'contain' })}
                                        >
                                            <ToggleGroupItem value="cover" className="flex-1">Fill the screen</ToggleGroupItem>
                                            <ToggleGroupItem value="contain" className="flex-1">Show it all</ToggleGroupItem>
                                        </ToggleGroup>
                                    </Row>
                                </>
                            )}

                            {item.kind === 'strip' && (
                                <p className="text-sm text-muted-foreground">
                                    {item.images.map((i) => i.name).join(', ')}
                                </p>
                            )}

                            {item.kind === 'text' && (
                                <p className="text-sm text-muted-foreground">Change this text on the Text tab, save it, and add it again.</p>
                            )}
                        </div>
                        <DrawerFooter className="flex-row">
                            <Button variant="destructive" size="lg" className="h-11" onClick={onRemove}>
                                <Trash2 /> Remove
                            </Button>
                            <Button size="lg" className="h-11 flex-1" onClick={onShowNow}>
                                <Play /> Show this now
                            </Button>
                        </DrawerFooter>
                    </>
                )}
            </DrawerContent>
        </Drawer>
    );
}
