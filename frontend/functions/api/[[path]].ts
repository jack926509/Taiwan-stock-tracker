import { proxyApiRequest } from "../../lib/apiProxy";

export const onRequest = ({ request }: { request: Request }) => proxyApiRequest(request);
