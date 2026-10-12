import React from 'react';
import { getProfileImageUrl } from '../../utils/assetUtils';

interface AvatarProps {
    src?: string;
    name?: string;
    size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';
    className?: string;
    border?: boolean;
    status?: 'online' | 'offline' | 'busy' | 'away';
    updatedAt?: string;
}

const Avatar: React.FC<AvatarProps> = ({
    src,
    name = '',
    size = 'md',
    className = '',
    border = false,
    status,
    updatedAt
}) => {
    const getInitials = (n: string) => {
        if (!n) return '?';
        return n.split(' ').filter(Boolean).map(part => part[0]).join('').toUpperCase().slice(0, 2);
    };

    const sizes = {
        xs: 'w-7 h-7 text-[8px]',
        sm: 'w-8 h-8 text-[10px]',
        md: 'w-10 h-10 text-xs',
        lg: 'w-14 h-14 text-sm',
        xl: 'w-24 h-24 text-2xl',
        '2xl': 'w-32 h-32 text-3xl',
    };

    const [imgError, setImgError] = React.useState(false);
    const initials = getInitials(name);

    // Reset error state when src changes (e.g. after upload)
    React.useEffect(() => {
        setImgError(false);
    }, [src]);

    // Only use stable version from updatedAt. Do NOT use Date.now() as version 
    // because it creates a new URL on every render causing infinite reload loops.
    const version = updatedAt ? new Date(updatedAt).getTime() : undefined;
    const fullSrc = src ? getProfileImageUrl(src, version) : undefined;

    return (
        <div className={`relative shrink-0 flex justify-center ${className}`}>
            <div className={`relative ${sizes[size]} rounded-full overflow-hidden flex items-center justify-center ${border ? 'border-4 border-white shadow-md' : ''}`}>
                {fullSrc && !imgError ? (
                    <img
                        src={fullSrc}
                        alt={name}
                        className="h-full w-full object-cover"
                        onError={() => {
                            console.warn("Image load failed for:", fullSrc);
                            setImgError(true);
                        }}
                    />
                ) : (
                    <div className="flex h-full w-full items-center justify-center font-bold bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-100">
                        {initials}
                    </div>
                )}
            </div>

            {status && (
                <span className={`
                    absolute bottom-0 right-0 
                    ${size === 'sm' ? 'w-2 h-2' : size === 'md' ? 'w-2.5 h-2.5' : 'w-3.5 h-3.5'} 
                    rounded-full border-2 border-white 
                    ${status === 'online' ? 'bg-emerald-500' : status === 'offline' ? 'bg-gray-400' : status === 'busy' ? 'bg-red-500' : 'bg-amber-500'}
                `} />
            )}
        </div>
    );
};

export default Avatar;
