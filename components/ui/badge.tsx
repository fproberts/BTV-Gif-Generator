import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
    'inline-flex items-center rounded-full px-3 py-0.5 text-[10px] font-bold uppercase tracking-wider transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
    {
        variants: {
            variant: {
                default: 'bg-[#28221e] text-[#e6d7c3] border border-[#38302b]',
                terracotta: 'bg-[#c85a32]/20 text-[#e06b43] border border-[#c85a32]/40',
                moss: 'bg-[#6b7c4d]/20 text-[#93a674] border border-[#6b7c4d]/40',
                amber: 'bg-[#d97706]/20 text-[#f59e0b] border border-[#d97706]/40',
                sand: 'bg-[#e6d7c3] text-[#1c1815] font-extrabold',
                destructive: 'bg-[#99332c]/20 text-[#e65c53] border border-[#99332c]/40',
                outline: 'text-[#a89b8c] border border-[#38302b]',
            },
        },
        defaultVariants: {
            variant: 'default',
        },
    }
);

export interface BadgeProps
    extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> { }

function Badge({ className, variant, ...props }: BadgeProps) {
    return (
        <div className={cn(badgeVariants({ variant }), className)} {...props} />
    );
}

export { Badge, badgeVariants };
