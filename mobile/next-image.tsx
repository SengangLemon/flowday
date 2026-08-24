/* eslint-disable @next/next/no-img-element */
import type { CSSProperties, ImgHTMLAttributes } from 'react';

type MobileImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> & {
  src: string | { src: string };
  priority?: boolean;
};

export default function MobileImage({ src, priority, width, height, style, ...props }: MobileImageProps) {
  const source = typeof src === 'string' ? src : src.src;
  const dimensions: CSSProperties = {
    width: typeof width === 'number' ? width : undefined,
    height: typeof height === 'number' ? height : undefined,
    ...style,
  };
  return <img {...props} alt={props.alt ?? ''} src={source} width={width} height={height} style={dimensions} loading={priority ? 'eager' : props.loading} />;
}
