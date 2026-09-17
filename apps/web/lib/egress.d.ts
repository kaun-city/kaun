export declare const EGRESS_HOSTS: Record<string, { http: boolean }>
export declare const FORWARD_REQUEST_HEADERS: string[]
export declare const FORWARD_RESPONSE_HEADERS: string[]
export declare const EGRESS_SECRET_HEADER: string
export declare const EGRESS_ERROR_HEADER: string
export declare const GODADDY_G2_INTERMEDIATE: string
export declare function egressTarget(raw: unknown): { url: URL; error?: undefined } | { error: string; url?: undefined }
export declare function isEgressUrl(raw: unknown): boolean
