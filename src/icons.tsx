import React from 'react';

interface IconProps extends React.HTMLAttributes<HTMLSpanElement> {
  size?: number;
}

function createIcon(label: string) {
  return function Icon({ size, ...props }: IconProps) {
    return <span {...props}>{label}</span>;
  };
}

export const Download = createIcon('↓');
export const Upload = createIcon('↑');
export const BarChart3 = createIcon('📊');
export const Timer = createIcon('⏱️');
export const Play = createIcon('▶️');
export const Square = createIcon('⏹️');
export const QrCode = createIcon('🔳');
export const FileText = createIcon('📄');
export const Users = createIcon('👥');
export const BookOpenCheck = createIcon('📘');
