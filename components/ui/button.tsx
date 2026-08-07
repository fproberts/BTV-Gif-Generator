import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
    'inline-flex items-center justify-center whitespace-nowrap rounded-2xl text-xs font-bold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c85a32]/50 disabled:pointer-events-none disabled:opacity-50 active:scale-[0.97]',
    {
        variants: {
            variant: {
                default: 'bg-[#c85a32] hover:bg-[#b34726] text-[#fbf7f2] shadow-md shadow-[#c85a32]/20 border border-[#d96b43]/30',
                terracotta: 'bg-[#c85a32] hover:bg-[#b34726] text-[#fbf7f2] shadow-md shadow-[#c85a32]/20 border border-[#d96b43]/30',
                moss: 'bg-[#6b7c4d] hover:bg-[#5b6b3e] text-[#fbf7f2] shadow-md shadow-[#6b7c4d]/20 border border-[#7e915c]/30',
                amber: 'bg-[#d97706] hover:bg-[#b45309] text-[#fbf7f2] shadow-md shadow-[#d97706]/20 border border-[#f59e0b]/30',
                sand: 'bg-[#e6d7c3] hover:bg-[#d6c5ad] text-[#1c1815] font-extrabold shadow-md shadow-black/20',
                destructive: 'bg-[#99332c] hover:bg-[#802a24] text-[#fbf7f2] border border-[#b33e36]/30',
                outline: 'border border-[#38302b] bg-[#201b18] hover:bg-[#28221e] text-[#e6d7c3]',
                secondary: 'bg-[#28221e] hover:bg-[#322a25] text-[#e6d7c3] border border-[#38302b]',
                ghost: 'hover:bg-[#28221e] text-[#a89b8c] hover:text-[#f4ebe1]',
                link: 'text-[#c85a32] underline-offset-4 hover:underline',
            },
            size: {
                default: 'h-10 px-4 py-2',
                sm: 'h-8.5 rounded-xl px-3.5 text-xs',
                lg: 'h-12 rounded-2xl px-8 text-sm font-extrabold',
                icon: 'h-9 w-9 p-0 rounded-xl',
            },
        },
        defaultVariants: {
            variant: 'default',
            size: 'default',
        },
    }
);

export interface ButtonProps
    extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
    asChild?: boolean;
    isLoading?: boolean;
    loadingText?: string;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
    ({ className, variant, size, asChild = false, isLoading = false, loadingText, children, disabled, ...props }, ref) => {
        if (asChild) {
            return <Slot className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
        }

        return (
            <button
                className={cn(buttonVariants({ variant, size, className }))}
                ref={ref}
                disabled={disabled || isLoading}
                {...props}
            >
                {isLoading ? (
                    <>
                        <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin text-current" />
                        {loadingText || children}
                    </>
                ) : (
                    children
                )}
            </button>
        );
    }
);
Button.displayName = 'Button';

export { Button, buttonVariants };
