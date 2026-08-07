import * as React from 'react';
import { cn } from '@/lib/utils';

export interface InputProps
    extends React.InputHTMLAttributes<HTMLInputElement> { }

const Input = React.forwardRef<HTMLInputElement, InputProps>(
    ({ className, type, ...props }, ref) => {
        return (
            <input
                type={type}
                className={cn(
                    'flex h-10.5 w-full rounded-2xl border border-[#38302b] bg-[#171311] px-4 py-2 text-xs font-medium text-[#f4ebe1] ring-offset-background file:border-0 file:bg-transparent file:text-xs file:font-medium placeholder:text-[#8a7c70] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c85a32]/50 focus-visible:border-[#c85a32]/50 disabled:cursor-not-allowed disabled:opacity-50 transition-all',
                    className
                )}
                ref={ref}
                {...props}
            />
        );
    }
);
Input.displayName = 'Input';

export { Input };
