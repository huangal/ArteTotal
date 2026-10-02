import { createRequire } from "node:module";
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Http2ServerRequest, constants } from "http2";
import { Readable } from "stream";
import crypto from "crypto";
import { createReadStream, existsSync as existsSync$1, statSync as statSync$1 } from "fs";
import { join as join$1 } from "path";
import { versions } from "process";
import { mkdir, unlink, writeFile } from "node:fs/promises";
//#region node_modules/@hono/node-server/dist/index.mjs
var RequestError = class extends Error {
	constructor(message, options) {
		super(message, options);
		this.name = "RequestError";
	}
};
var toRequestError = (e) => {
	if (e instanceof RequestError) return e;
	return new RequestError(e.message, { cause: e });
};
var GlobalRequest = global.Request;
var Request$1 = class extends GlobalRequest {
	constructor(input, options) {
		if (typeof input === "object" && getRequestCache in input) input = input[getRequestCache]();
		if (typeof options?.body?.getReader !== "undefined") options.duplex ??= "half";
		super(input, options);
	}
};
var newHeadersFromIncoming = (incoming) => {
	const headerRecord = [];
	const rawHeaders = incoming.rawHeaders;
	for (let i = 0; i < rawHeaders.length; i += 2) {
		const { [i]: key, [i + 1]: value } = rawHeaders;
		if (key.charCodeAt(0) !== 58) headerRecord.push([key, value]);
	}
	return new Headers(headerRecord);
};
var wrapBodyStream = Symbol("wrapBodyStream");
var newRequestFromIncoming = (method, url, headers, incoming, abortController) => {
	const init = {
		method,
		headers,
		signal: abortController.signal
	};
	if (method === "TRACE") {
		init.method = "GET";
		const req = new Request$1(url, init);
		Object.defineProperty(req, "method", { get() {
			return "TRACE";
		} });
		return req;
	}
	if (!(method === "GET" || method === "HEAD")) {
		if ("rawBody" in incoming && incoming.rawBody instanceof Buffer) init.body = new ReadableStream({ start(controller) {
			controller.enqueue(incoming.rawBody);
			controller.close();
		} });
		else if (incoming[wrapBodyStream]) {
			let reader;
			init.body = new ReadableStream({ async pull(controller) {
				try {
					reader ||= Readable.toWeb(incoming).getReader();
					const { done, value } = await reader.read();
					if (done) controller.close();
					else controller.enqueue(value);
				} catch (error) {
					controller.error(error);
				}
			} });
		} else init.body = Readable.toWeb(incoming);
	}
	return new Request$1(url, init);
};
var getRequestCache = Symbol("getRequestCache");
var requestCache = Symbol("requestCache");
var incomingKey = Symbol("incomingKey");
var urlKey = Symbol("urlKey");
var headersKey = Symbol("headersKey");
var abortControllerKey = Symbol("abortControllerKey");
var requestPrototype = {
	get method() {
		return this[incomingKey].method || "GET";
	},
	get url() {
		return this[urlKey];
	},
	get headers() {
		return this[headersKey] ||= newHeadersFromIncoming(this[incomingKey]);
	},
	[Symbol("getAbortController")]() {
		this[getRequestCache]();
		return this[abortControllerKey];
	},
	[getRequestCache]() {
		this[abortControllerKey] ||= new AbortController();
		return this[requestCache] ||= newRequestFromIncoming(this.method, this[urlKey], this.headers, this[incomingKey], this[abortControllerKey]);
	}
};
[
	"body",
	"bodyUsed",
	"cache",
	"credentials",
	"destination",
	"integrity",
	"mode",
	"redirect",
	"referrer",
	"referrerPolicy",
	"signal",
	"keepalive"
].forEach((k) => {
	Object.defineProperty(requestPrototype, k, { get() {
		return this[getRequestCache]()[k];
	} });
});
[
	"arrayBuffer",
	"blob",
	"clone",
	"formData",
	"json",
	"text"
].forEach((k) => {
	Object.defineProperty(requestPrototype, k, { value: function() {
		return this[getRequestCache]()[k]();
	} });
});
Object.defineProperty(requestPrototype, Symbol.for("nodejs.util.inspect.custom"), { value: function(depth, options, inspectFn) {
	return `Request (lightweight) ${inspectFn({
		method: this.method,
		url: this.url,
		headers: this.headers,
		nativeRequest: this[requestCache]
	}, {
		...options,
		depth: depth == null ? null : depth - 1
	})}`;
} });
Object.setPrototypeOf(requestPrototype, Request$1.prototype);
var newRequest = (incoming, defaultHostname) => {
	const req = Object.create(requestPrototype);
	req[incomingKey] = incoming;
	const incomingUrl = incoming.url || "";
	if (incomingUrl[0] !== "/" && (incomingUrl.startsWith("http://") || incomingUrl.startsWith("https://"))) {
		if (incoming instanceof Http2ServerRequest) throw new RequestError("Absolute URL for :path is not allowed in HTTP/2");
		try {
			req[urlKey] = new URL(incomingUrl).href;
		} catch (e) {
			throw new RequestError("Invalid absolute URL", { cause: e });
		}
		return req;
	}
	const host = (incoming instanceof Http2ServerRequest ? incoming.authority : incoming.headers.host) || defaultHostname;
	if (!host) throw new RequestError("Missing host header");
	let scheme;
	if (incoming instanceof Http2ServerRequest) {
		scheme = incoming.scheme;
		if (!(scheme === "http" || scheme === "https")) throw new RequestError("Unsupported scheme");
	} else scheme = incoming.socket && incoming.socket.encrypted ? "https" : "http";
	const url = new URL(`${scheme}://${host}${incomingUrl}`);
	if (url.hostname.length !== host.length && url.hostname !== host.replace(/:\d+$/, "")) throw new RequestError("Invalid host header");
	req[urlKey] = url.href;
	return req;
};
var responseCache = Symbol("responseCache");
var getResponseCache = Symbol("getResponseCache");
var cacheKey = Symbol("cache");
var GlobalResponse = global.Response;
var Response2 = class _Response {
	#body;
	#init;
	[getResponseCache]() {
		delete this[cacheKey];
		return this[responseCache] ||= new GlobalResponse(this.#body, this.#init);
	}
	constructor(body, init) {
		let headers;
		this.#body = body;
		if (init instanceof _Response) {
			const cachedGlobalResponse = init[responseCache];
			if (cachedGlobalResponse) {
				this.#init = cachedGlobalResponse;
				this[getResponseCache]();
				return;
			} else {
				this.#init = init.#init;
				headers = new Headers(init.#init.headers);
			}
		} else this.#init = init;
		if (typeof body === "string" || typeof body?.getReader !== "undefined" || body instanceof Blob || body instanceof Uint8Array) this[cacheKey] = [
			init?.status || 200,
			body,
			headers || init?.headers
		];
	}
	get headers() {
		const cache = this[cacheKey];
		if (cache) {
			if (!(cache[2] instanceof Headers)) cache[2] = new Headers(cache[2] || { "content-type": "text/plain; charset=UTF-8" });
			return cache[2];
		}
		return this[getResponseCache]().headers;
	}
	get status() {
		return this[cacheKey]?.[0] ?? this[getResponseCache]().status;
	}
	get ok() {
		const status = this.status;
		return status >= 200 && status < 300;
	}
};
[
	"body",
	"bodyUsed",
	"redirected",
	"statusText",
	"trailers",
	"type",
	"url"
].forEach((k) => {
	Object.defineProperty(Response2.prototype, k, { get() {
		return this[getResponseCache]()[k];
	} });
});
[
	"arrayBuffer",
	"blob",
	"clone",
	"formData",
	"json",
	"text"
].forEach((k) => {
	Object.defineProperty(Response2.prototype, k, { value: function() {
		return this[getResponseCache]()[k]();
	} });
});
Object.defineProperty(Response2.prototype, Symbol.for("nodejs.util.inspect.custom"), { value: function(depth, options, inspectFn) {
	return `Response (lightweight) ${inspectFn({
		status: this.status,
		headers: this.headers,
		ok: this.ok,
		nativeResponse: this[responseCache]
	}, {
		...options,
		depth: depth == null ? null : depth - 1
	})}`;
} });
Object.setPrototypeOf(Response2, GlobalResponse);
Object.setPrototypeOf(Response2.prototype, GlobalResponse.prototype);
async function readWithoutBlocking(readPromise) {
	return Promise.race([readPromise, Promise.resolve().then(() => Promise.resolve(void 0))]);
}
function writeFromReadableStreamDefaultReader(reader, writable, currentReadPromise) {
	const cancel = (error) => {
		reader.cancel(error).catch(() => {});
	};
	writable.on("close", cancel);
	writable.on("error", cancel);
	(currentReadPromise ?? reader.read()).then(flow, handleStreamError);
	return reader.closed.finally(() => {
		writable.off("close", cancel);
		writable.off("error", cancel);
	});
	function handleStreamError(error) {
		if (error) writable.destroy(error);
	}
	function onDrain() {
		reader.read().then(flow, handleStreamError);
	}
	function flow({ done, value }) {
		try {
			if (done) writable.end();
			else if (!writable.write(value)) writable.once("drain", onDrain);
			else return reader.read().then(flow, handleStreamError);
		} catch (e) {
			handleStreamError(e);
		}
	}
}
function writeFromReadableStream(stream, writable) {
	if (stream.locked) throw new TypeError("ReadableStream is locked.");
	else if (writable.destroyed) return;
	return writeFromReadableStreamDefaultReader(stream.getReader(), writable);
}
var buildOutgoingHttpHeaders = (headers) => {
	const res = {};
	if (!(headers instanceof Headers)) headers = new Headers(headers ?? void 0);
	const cookies = [];
	for (const [k, v] of headers) if (k === "set-cookie") cookies.push(v);
	else res[k] = v;
	if (cookies.length > 0) res["set-cookie"] = cookies;
	res["content-type"] ??= "text/plain; charset=UTF-8";
	return res;
};
var X_ALREADY_SENT = "x-hono-already-sent";
if (typeof global.crypto === "undefined") global.crypto = crypto;
var outgoingEnded = Symbol("outgoingEnded");
var incomingDraining = Symbol("incomingDraining");
var DRAIN_TIMEOUT_MS = 500;
var MAX_DRAIN_BYTES = 67108864;
var drainIncoming = (incoming) => {
	const incomingWithDrainState = incoming;
	if (incoming.destroyed || incomingWithDrainState[incomingDraining]) return;
	incomingWithDrainState[incomingDraining] = true;
	if (incoming instanceof Http2ServerRequest) {
		try {
			incoming.stream?.close?.(constants.NGHTTP2_NO_ERROR);
		} catch {}
		return;
	}
	let bytesRead = 0;
	const cleanup = () => {
		clearTimeout(timer);
		incoming.off("data", onData);
		incoming.off("end", cleanup);
		incoming.off("error", cleanup);
	};
	const forceClose = () => {
		cleanup();
		const socket = incoming.socket;
		if (socket && !socket.destroyed) socket.destroySoon();
	};
	const timer = setTimeout(forceClose, DRAIN_TIMEOUT_MS);
	timer.unref?.();
	const onData = (chunk) => {
		bytesRead += chunk.length;
		if (bytesRead > MAX_DRAIN_BYTES) forceClose();
	};
	incoming.on("data", onData);
	incoming.on("end", cleanup);
	incoming.on("error", cleanup);
	incoming.resume();
};
var handleRequestError = () => new Response(null, { status: 400 });
var handleFetchError = (e) => new Response(null, { status: e instanceof Error && (e.name === "TimeoutError" || e.constructor.name === "TimeoutError") ? 504 : 500 });
var handleResponseError = (e, outgoing) => {
	const err = e instanceof Error ? e : new Error("unknown error", { cause: e });
	if (err.code === "ERR_STREAM_PREMATURE_CLOSE") console.info("The user aborted a request.");
	else {
		console.error(e);
		if (!outgoing.headersSent) outgoing.writeHead(500, { "Content-Type": "text/plain" });
		outgoing.end(`Error: ${err.message}`);
		outgoing.destroy(err);
	}
};
var flushHeaders = (outgoing) => {
	if ("flushHeaders" in outgoing && outgoing.writable) outgoing.flushHeaders();
};
var responseViaCache = async (res, outgoing) => {
	let [status, body, header] = res[cacheKey];
	let hasContentLength = false;
	if (!header) header = { "content-type": "text/plain; charset=UTF-8" };
	else if (header instanceof Headers) {
		hasContentLength = header.has("content-length");
		header = buildOutgoingHttpHeaders(header);
	} else if (Array.isArray(header)) {
		const headerObj = new Headers(header);
		hasContentLength = headerObj.has("content-length");
		header = buildOutgoingHttpHeaders(headerObj);
	} else for (const key in header) if (key.length === 14 && key.toLowerCase() === "content-length") {
		hasContentLength = true;
		break;
	}
	if (!hasContentLength) {
		if (typeof body === "string") header["Content-Length"] = Buffer.byteLength(body);
		else if (body instanceof Uint8Array) header["Content-Length"] = body.byteLength;
		else if (body instanceof Blob) header["Content-Length"] = body.size;
	}
	outgoing.writeHead(status, header);
	if (typeof body === "string" || body instanceof Uint8Array) outgoing.end(body);
	else if (body instanceof Blob) outgoing.end(new Uint8Array(await body.arrayBuffer()));
	else {
		flushHeaders(outgoing);
		await writeFromReadableStream(body, outgoing)?.catch((e) => handleResponseError(e, outgoing));
	}
	outgoing[outgoingEnded]?.();
};
var isPromise = (res) => typeof res.then === "function";
var responseViaResponseObject = async (res, outgoing, options = {}) => {
	if (isPromise(res)) {
		if (options.errorHandler) try {
			res = await res;
		} catch (err) {
			const errRes = await options.errorHandler(err);
			if (!errRes) return;
			res = errRes;
		}
		else res = await res.catch(handleFetchError);
	}
	if (cacheKey in res) return responseViaCache(res, outgoing);
	const resHeaderRecord = buildOutgoingHttpHeaders(res.headers);
	if (res.body) {
		const reader = res.body.getReader();
		const values = [];
		let done = false;
		let currentReadPromise = void 0;
		if (resHeaderRecord["transfer-encoding"] !== "chunked") {
			let maxReadCount = 2;
			for (let i = 0; i < maxReadCount; i++) {
				currentReadPromise ||= reader.read();
				const chunk = await readWithoutBlocking(currentReadPromise).catch((e) => {
					console.error(e);
					done = true;
				});
				if (!chunk) {
					if (i === 1) {
						await new Promise((resolve) => setTimeout(resolve));
						maxReadCount = 3;
						continue;
					}
					break;
				}
				currentReadPromise = void 0;
				if (chunk.value) values.push(chunk.value);
				if (chunk.done) {
					done = true;
					break;
				}
			}
			if (done && !("content-length" in resHeaderRecord)) resHeaderRecord["content-length"] = values.reduce((acc, value) => acc + value.length, 0);
		}
		outgoing.writeHead(res.status, resHeaderRecord);
		values.forEach((value) => {
			outgoing.write(value);
		});
		if (done) outgoing.end();
		else {
			if (values.length === 0) flushHeaders(outgoing);
			await writeFromReadableStreamDefaultReader(reader, outgoing, currentReadPromise);
		}
	} else if (resHeaderRecord[X_ALREADY_SENT]) {} else {
		outgoing.writeHead(res.status, resHeaderRecord);
		outgoing.end();
	}
	outgoing[outgoingEnded]?.();
};
var getRequestListener = (fetchCallback, options = {}) => {
	const autoCleanupIncoming = options.autoCleanupIncoming ?? true;
	if (options.overrideGlobalObjects !== false && global.Request !== Request$1) {
		Object.defineProperty(global, "Request", { value: Request$1 });
		Object.defineProperty(global, "Response", { value: Response2 });
	}
	return async (incoming, outgoing) => {
		let res, req;
		try {
			req = newRequest(incoming, options.hostname);
			let incomingEnded = !autoCleanupIncoming || incoming.method === "GET" || incoming.method === "HEAD";
			if (!incomingEnded) {
				incoming[wrapBodyStream] = true;
				incoming.on("end", () => {
					incomingEnded = true;
				});
				if (incoming instanceof Http2ServerRequest) outgoing[outgoingEnded] = () => {
					if (!incomingEnded) setTimeout(() => {
						if (!incomingEnded) setTimeout(() => {
							drainIncoming(incoming);
						});
					});
				};
				outgoing.on("finish", () => {
					if (!incomingEnded) drainIncoming(incoming);
				});
			}
			outgoing.on("close", () => {
				if (req[abortControllerKey]) {
					if (incoming.errored) req[abortControllerKey].abort(incoming.errored.toString());
					else if (!outgoing.writableFinished) req[abortControllerKey].abort("Client connection prematurely closed.");
				}
				if (!incomingEnded) setTimeout(() => {
					if (!incomingEnded) setTimeout(() => {
						drainIncoming(incoming);
					});
				});
			});
			res = fetchCallback(req, {
				incoming,
				outgoing
			});
			if (cacheKey in res) return responseViaCache(res, outgoing);
		} catch (e) {
			if (!res) {
				if (options.errorHandler) {
					res = await options.errorHandler(req ? e : toRequestError(e));
					if (!res) return;
				} else if (!req) res = handleRequestError();
				else res = handleFetchError(e);
			} else return handleResponseError(e, outgoing);
		}
		try {
			return await responseViaResponseObject(res, outgoing, options);
		} catch (e) {
			return handleResponseError(e, outgoing);
		}
	};
};
//#endregion
//#region node_modules/hono/dist/utils/mime.js
var getMimeType = (filename, mimes = baseMimes) => {
	const match = filename.match(/\.([a-zA-Z0-9]+?)$/);
	if (!match) return;
	return mimes[match[1].toLowerCase()];
};
var baseMimes = {
	aac: "audio/aac",
	avi: "video/x-msvideo",
	avif: "image/avif",
	av1: "video/av1",
	bin: "application/octet-stream",
	bmp: "image/bmp",
	css: "text/css; charset=utf-8",
	csv: "text/csv; charset=utf-8",
	eot: "application/vnd.ms-fontobject",
	epub: "application/epub+zip",
	gif: "image/gif",
	gz: "application/gzip",
	htm: "text/html; charset=utf-8",
	html: "text/html; charset=utf-8",
	ico: "image/x-icon",
	ics: "text/calendar; charset=utf-8",
	jpeg: "image/jpeg",
	jpg: "image/jpeg",
	js: "text/javascript; charset=utf-8",
	json: "application/json",
	jsonld: "application/ld+json",
	map: "application/json",
	mid: "audio/x-midi",
	midi: "audio/x-midi",
	mjs: "text/javascript; charset=utf-8",
	mp3: "audio/mpeg",
	mp4: "video/mp4",
	mpeg: "video/mpeg",
	oga: "audio/ogg",
	ogv: "video/ogg",
	ogx: "application/ogg",
	opus: "audio/opus",
	otf: "font/otf",
	pdf: "application/pdf",
	png: "image/png",
	rtf: "application/rtf",
	svg: "image/svg+xml; charset=utf-8",
	tif: "image/tiff",
	tiff: "image/tiff",
	ts: "video/mp2t",
	ttf: "font/ttf",
	txt: "text/plain; charset=utf-8",
	wasm: "application/wasm",
	webm: "video/webm",
	weba: "audio/webm",
	webmanifest: "application/manifest+json",
	webp: "image/webp",
	woff: "font/woff",
	woff2: "font/woff2",
	xhtml: "application/xhtml+xml; charset=utf-8",
	xml: "application/xml; charset=utf-8",
	zip: "application/zip",
	"3gp": "video/3gpp",
	"3g2": "video/3gpp2",
	gltf: "model/gltf+json",
	glb: "model/gltf-binary"
};
//#endregion
//#region node_modules/@hono/node-server/dist/serve-static.mjs
var COMPRESSIBLE_CONTENT_TYPE_REGEX = /^\s*(?:text\/[^;\s]+|application\/(?:javascript|json|xml|xml-dtd|ecmascript|dart|postscript|rtf|tar|toml|vnd\.dart|vnd\.ms-fontobject|vnd\.ms-opentype|wasm|x-httpd-php|x-javascript|x-ns-proxy-autoconfig|x-sh|x-tar|x-virtualbox-hdd|x-virtualbox-ova|x-virtualbox-ovf|x-virtualbox-vbox|x-virtualbox-vdi|x-virtualbox-vhd|x-virtualbox-vmdk|x-www-form-urlencoded)|font\/(?:otf|ttf)|image\/(?:bmp|vnd\.adobe\.photoshop|vnd\.microsoft\.icon|vnd\.ms-dds|x-icon|x-ms-bmp)|message\/rfc822|model\/gltf-binary|x-shader\/x-fragment|x-shader\/x-vertex|[^;\s]+?\+(?:json|text|xml|yaml))(?:[;\s]|$)/i;
var ENCODINGS = {
	br: ".br",
	zstd: ".zst",
	gzip: ".gz"
};
var ENCODINGS_ORDERED_KEYS = Object.keys(ENCODINGS);
var pr54206Applied = () => {
	const [major, minor] = versions.node.split(".").map((component) => parseInt(component));
	return major >= 23 || major === 22 && minor >= 7 || major === 20 && minor >= 18;
};
var useReadableToWeb = pr54206Applied();
var createStreamBody = (stream) => {
	if (useReadableToWeb) return Readable.toWeb(stream);
	return new ReadableStream({
		start(controller) {
			stream.on("data", (chunk) => {
				controller.enqueue(chunk);
			});
			stream.on("error", (err) => {
				controller.error(err);
			});
			stream.on("end", () => {
				controller.close();
			});
		},
		cancel() {
			stream.destroy();
		}
	});
};
var getStats = (path) => {
	let stats;
	try {
		stats = statSync$1(path);
	} catch {}
	return stats;
};
var tryDecode$1 = (str, decoder) => {
	try {
		return decoder(str);
	} catch {
		return str.replace(/(?:%[0-9A-Fa-f]{2})+/g, (match) => {
			try {
				return decoder(match);
			} catch {
				return match;
			}
		});
	}
};
var tryDecodeURI$1 = (str) => tryDecode$1(str, decodeURI);
var serveStatic = (options = { root: "" }) => {
	const root = options.root || "";
	const optionPath = options.path;
	if (root !== "" && !existsSync$1(root)) console.error(`serveStatic: root path '${root}' is not found, are you sure it's correct?`);
	return async (c, next) => {
		if (c.finalized) return next();
		let filename;
		if (optionPath) filename = optionPath;
		else try {
			filename = tryDecodeURI$1(c.req.path);
			if (/(?:^|[\/\\])\.{1,2}(?:$|[\/\\])|[\/\\]{2,}|\\/.test(filename)) throw new Error();
		} catch {
			await options.onNotFound?.(c.req.path, c);
			return next();
		}
		let path = join$1(root, !optionPath && options.rewriteRequestPath ? options.rewriteRequestPath(filename, c) : filename);
		let stats = getStats(path);
		if (stats && stats.isDirectory()) {
			const indexFile = options.index ?? "index.html";
			path = join$1(path, indexFile);
			stats = getStats(path);
		}
		if (!stats) {
			await options.onNotFound?.(path, c);
			return next();
		}
		const mimeType = getMimeType(path);
		c.header("Content-Type", mimeType || "application/octet-stream");
		if (options.precompressed && (!mimeType || COMPRESSIBLE_CONTENT_TYPE_REGEX.test(mimeType))) {
			const acceptEncodingSet = new Set(c.req.header("Accept-Encoding")?.split(",").map((encoding) => encoding.trim()));
			for (const encoding of ENCODINGS_ORDERED_KEYS) {
				if (!acceptEncodingSet.has(encoding)) continue;
				const precompressedStats = getStats(path + ENCODINGS[encoding]);
				if (precompressedStats) {
					c.header("Content-Encoding", encoding);
					c.header("Vary", "Accept-Encoding", { append: true });
					stats = precompressedStats;
					path = path + ENCODINGS[encoding];
					break;
				}
			}
		}
		let result;
		const size = stats.size;
		const range = c.req.header("range") || "";
		if (c.req.method == "HEAD" || c.req.method == "OPTIONS") {
			c.header("Content-Length", size.toString());
			c.status(200);
			result = c.body(null);
		} else if (!range) {
			c.header("Content-Length", size.toString());
			result = c.body(createStreamBody(createReadStream(path)), 200);
		} else {
			c.header("Accept-Ranges", "bytes");
			c.header("Date", stats.birthtime.toUTCString());
			const parts = range.replace(/bytes=/, "").split("-", 2);
			const start = parseInt(parts[0], 10) || 0;
			let end = parseInt(parts[1], 10) || size - 1;
			if (size < end - start + 1) end = size - 1;
			const chunksize = end - start + 1;
			const stream = createReadStream(path, {
				start,
				end
			});
			c.header("Content-Length", chunksize.toString());
			c.header("Content-Range", `bytes ${start}-${end}/${stats.size}`);
			result = c.body(createStreamBody(stream), 206);
		}
		await options.onFound?.(path, c);
		return result;
	};
};
//#endregion
//#region node_modules/hono/dist/compose.js
var compose = (middleware, onError, onNotFound) => {
	return (context, next) => {
		let index = -1;
		return dispatch(0);
		async function dispatch(i) {
			if (i <= index) throw new Error("next() called multiple times");
			index = i;
			let res;
			let isError = false;
			let handler;
			if (middleware[i]) {
				handler = middleware[i][0][0];
				context.req.routeIndex = i;
			} else handler = i === middleware.length && next || void 0;
			if (handler) try {
				res = await handler(context, () => dispatch(i + 1));
			} catch (err) {
				if (err instanceof Error && onError) {
					context.error = err;
					res = await onError(err, context);
					isError = true;
				} else throw err;
			}
			else if (context.finalized === false && onNotFound) res = await onNotFound(context);
			if (res && (context.finalized === false || isError)) context.res = res;
			return context;
		}
	};
};
//#endregion
//#region node_modules/hono/dist/http-exception.js
var HTTPException = class extends Error {
	res;
	status;
	/**
	* Creates an instance of `HTTPException`.
	* @param status - HTTP status code for the exception. Defaults to 500.
	* @param options - Additional options for the exception.
	*/
	constructor(status = 500, options) {
		super(options?.message, { cause: options?.cause });
		this.res = options?.res;
		this.status = status;
	}
	/**
	* Returns the response object associated with the exception.
	* If a response object is not provided, a new response is created with the error message and status code.
	* @returns The response object.
	*/
	getResponse() {
		if (this.res) return new Response(this.res.body, {
			status: this.status,
			headers: this.res.headers
		});
		return new Response(this.message, { status: this.status });
	}
};
//#endregion
//#region node_modules/hono/dist/request/constants.js
var GET_MATCH_RESULT = /* @__PURE__ */ Symbol();
//#endregion
//#region node_modules/hono/dist/utils/buffer.js
var bufferToFormData = (arrayBuffer, contentType) => {
	return new Response(arrayBuffer, { headers: { "Content-Type": contentType.replace(/^[^;]+/, (mediaType) => mediaType.toLowerCase()) } }).formData();
};
//#endregion
//#region node_modules/hono/dist/utils/body.js
var MAX_NESTING_DEPTH = 32;
var MAX_NESTED_OBJECTS = 1e4;
var isRawRequest = (request) => "headers" in request;
var parseBody = async (request, options = /* @__PURE__ */ Object.create(null)) => {
	const { all = false, dot = false } = options;
	const mediaType = (isRawRequest(request) ? request.headers : request.raw.headers).get("Content-Type")?.split(";")[0].trim().toLowerCase();
	if (mediaType === "multipart/form-data" || mediaType === "application/x-www-form-urlencoded") return parseFormData(request, {
		all,
		dot
	});
	return {};
};
async function parseFormData(request, options) {
	if (!isRawRequest(request) && request.bodyCache.formData) return convertFormDataToBodyData(await request.bodyCache.formData, options);
	const headers = isRawRequest(request) ? request.headers : request.raw.headers;
	const formDataPromise = bufferToFormData(await request.arrayBuffer(), headers.get("Content-Type") || "");
	if (!isRawRequest(request)) request.bodyCache.formData = formDataPromise;
	const formData = await formDataPromise;
	if (formData) return convertFormDataToBodyData(formData, options);
	return {};
}
function convertFormDataToBodyData(formData, options) {
	const form = /* @__PURE__ */ Object.create(null);
	const nestingState = { count: 0 };
	formData.forEach((value, key) => {
		if (!(options.all || key.endsWith("[]"))) form[key] = value;
		else handleParsingAllValues(form, key, value);
	});
	if (options.dot) Object.entries(form).forEach(([key, value]) => {
		if (key.includes(".")) {
			handleParsingNestedValues(form, key, value, nestingState);
			delete form[key];
		}
	});
	return form;
}
var handleParsingAllValues = (form, key, value) => {
	if (form[key] !== void 0) {
		if (Array.isArray(form[key])) form[key].push(value);
		else form[key] = [form[key], value];
	} else if (!key.endsWith("[]")) form[key] = value;
	else form[key] = [value];
};
var handleParsingNestedValues = (form, key, value, state) => {
	if (/(?:^|\.)__proto__\./.test(key)) return;
	let nestedForm = form;
	const keys = key.split(".", MAX_NESTING_DEPTH + 2);
	if (keys.length > MAX_NESTING_DEPTH + 1) throwNestingLimitExceeded();
	keys.forEach((key2, index) => {
		if (index === keys.length - 1) nestedForm[key2] = value;
		else {
			if (!nestedForm[key2] || typeof nestedForm[key2] !== "object" || Array.isArray(nestedForm[key2]) || nestedForm[key2] instanceof File) {
				if (state.count++ >= MAX_NESTED_OBJECTS) throwNestingLimitExceeded();
				nestedForm[key2] = /* @__PURE__ */ Object.create(null);
			}
			nestedForm = nestedForm[key2];
		}
	});
};
var throwNestingLimitExceeded = () => {
	throw new Error("Nesting limit exceeded");
};
//#endregion
//#region node_modules/hono/dist/utils/url.js
var splitPath = (path) => {
	const paths = path.split("/");
	if (paths[0] === "") paths.shift();
	return paths;
};
var splitRoutingPath = (routePath) => {
	const { groups, path } = extractGroupsFromPath(routePath);
	return replaceGroupMarks(splitPath(path), groups);
};
var extractGroupsFromPath = (path) => {
	const groups = [];
	path = path.replace(/\{[^}]+\}/g, (match, index) => {
		const mark = `@${index}`;
		groups.push([mark, match]);
		return mark;
	});
	return {
		groups,
		path
	};
};
var replaceGroupMarks = (paths, groups) => {
	for (let i = groups.length - 1; i >= 0; i--) {
		const [mark] = groups[i];
		for (let j = paths.length - 1; j >= 0; j--) if (paths[j].includes(mark)) {
			paths[j] = paths[j].replace(mark, groups[i][1]);
			break;
		}
	}
	return paths;
};
var patternCache = {};
var getPattern = (label, next) => {
	if (label === "*") return "*";
	const match = label.match(/^\:([^\{\}]+)(?:\{(.+)\})?$/);
	if (match) {
		const cacheKey = `${label}#${next}`;
		if (!patternCache[cacheKey]) {
			if (match[2]) patternCache[cacheKey] = next && next[0] !== ":" && next[0] !== "*" ? [
				cacheKey,
				match[1],
				new RegExp(`^${match[2]}(?=/${next})`)
			] : [
				label,
				match[1],
				new RegExp(`^${match[2]}$`)
			];
			else patternCache[cacheKey] = [
				label,
				match[1],
				true
			];
		}
		return patternCache[cacheKey];
	}
	return null;
};
var tryDecode = (str, decoder) => {
	try {
		return decoder(str);
	} catch {
		return str.replace(/(?:%[0-9A-Fa-f]{2})+/g, (match) => {
			try {
				return decoder(match);
			} catch {
				return match;
			}
		});
	}
};
var tryDecodeURI = (str) => tryDecode(str, decodeURI);
var getPath = (request) => {
	const url = request.url;
	const start = url.indexOf("/", url.indexOf(":") + 4);
	let i = start;
	for (; i < url.length; i++) {
		const charCode = url.charCodeAt(i);
		if (charCode === 37) {
			const queryIndex = url.indexOf("?", i);
			const hashIndex = url.indexOf("#", i);
			const end = queryIndex === -1 ? hashIndex === -1 ? void 0 : hashIndex : hashIndex === -1 ? queryIndex : Math.min(queryIndex, hashIndex);
			const path = url.slice(start, end);
			return tryDecodeURI(path.includes("%25") ? path.replace(/%25/g, "%2525") : path);
		} else if (charCode === 63 || charCode === 35) break;
	}
	return url.slice(start, i);
};
var getPathNoStrict = (request) => {
	const result = getPath(request);
	return result.length > 1 && result.at(-1) === "/" ? result.slice(0, -1) : result;
};
var mergePath = (base, sub, ...rest) => {
	if (rest.length) sub = mergePath(sub, ...rest);
	return `${base?.[0] === "/" ? "" : "/"}${base}${sub === "/" ? "" : `${base?.at(-1) === "/" ? "" : "/"}${sub?.[0] === "/" ? sub.slice(1) : sub}`}`;
};
var checkOptionalParameter = (path) => {
	if (path.charCodeAt(path.length - 1) !== 63 || !path.includes(":")) return null;
	const segments = path.split("/");
	const results = [];
	let basePath = "";
	segments.forEach((segment) => {
		if (segment !== "" && !/\:/.test(segment)) basePath += "/" + segment;
		else if (/\:/.test(segment)) {
			if (segment.charCodeAt(segment.length - 1) === 63) {
				if (results.length === 0 && basePath === "") results.push("/");
				else results.push(basePath);
				const optionalSegment = segment.slice(0, -1);
				basePath += "/" + optionalSegment;
				results.push(basePath);
			} else basePath += "/" + segment;
		}
	});
	return results.filter((v, i, a) => a.indexOf(v) === i);
};
var tryDecodeURIComponent = (str) => str.indexOf("%") !== -1 ? tryDecode(str, decodeURIComponent_) : str;
var _decodeURI = (value) => {
	if (value.indexOf("+") !== -1) value = value.replace(/\+/g, " ");
	return tryDecodeURIComponent(value);
};
var _getQueryParam = (url, key, multiple) => {
	const hashIndex = url.indexOf("#", 8);
	if (hashIndex !== -1) url = url.slice(0, hashIndex);
	let encoded;
	if (!multiple && key && key.indexOf("%") === -1 && key.indexOf("+") === -1) {
		let keyIndex2 = url.indexOf("?", 8);
		if (keyIndex2 === -1) return;
		if (!url.startsWith(key, keyIndex2 + 1)) keyIndex2 = url.indexOf(`&${key}`, keyIndex2 + 1);
		while (keyIndex2 !== -1) {
			const trailingKeyCode = url.charCodeAt(keyIndex2 + key.length + 1);
			if (trailingKeyCode === 61) {
				const valueIndex = keyIndex2 + key.length + 2;
				const endIndex = url.indexOf("&", valueIndex);
				return _decodeURI(url.slice(valueIndex, endIndex === -1 ? void 0 : endIndex));
			} else if (trailingKeyCode == 38 || isNaN(trailingKeyCode)) return "";
			keyIndex2 = url.indexOf(`&${key}`, keyIndex2 + 1);
		}
		encoded = /[%+]/.test(url);
		if (!encoded) return;
	}
	const results = /* @__PURE__ */ Object.create(null);
	encoded ??= /[%+]/.test(url);
	let keyIndex = url.indexOf("?", 8);
	while (keyIndex !== -1) {
		const nextKeyIndex = url.indexOf("&", keyIndex + 1);
		let valueIndex = url.indexOf("=", keyIndex);
		if (valueIndex > nextKeyIndex && nextKeyIndex !== -1) valueIndex = -1;
		let name = url.slice(keyIndex + 1, valueIndex === -1 ? nextKeyIndex === -1 ? void 0 : nextKeyIndex : valueIndex);
		if (encoded) name = _decodeURI(name);
		keyIndex = nextKeyIndex;
		if (name === "") continue;
		let value;
		if (valueIndex === -1) value = "";
		else {
			value = url.slice(valueIndex + 1, nextKeyIndex === -1 ? void 0 : nextKeyIndex);
			if (encoded) value = _decodeURI(value);
		}
		if (multiple) {
			if (!(results[name] && Array.isArray(results[name]))) results[name] = [];
			results[name].push(value);
		} else results[name] ??= value;
	}
	return key ? results[key] : results;
};
var getQueryParam = _getQueryParam;
var getQueryParams = (url, key) => {
	return _getQueryParam(url, key, true);
};
var decodeURIComponent_ = decodeURIComponent;
//#endregion
//#region node_modules/hono/dist/request.js
var HonoRequest = class {
	/**
	* `.raw` can get the raw Request object.
	*
	* @see {@link https://hono.dev/docs/api/request#raw}
	*
	* @example
	* ```ts
	* // For Cloudflare Workers
	* app.post('/', async (c) => {
	*   const metadata = c.req.raw.cf?.hostMetadata?
	*   ...
	* })
	* ```
	*/
	raw;
	#validatedData;
	#matchResult;
	routeIndex = 0;
	/**
	* `.path` can get the pathname of the request.
	*
	* @see {@link https://hono.dev/docs/api/request#path}
	*
	* @example
	* ```ts
	* app.get('/about/me', (c) => {
	*   const pathname = c.req.path // `/about/me`
	* })
	* ```
	*/
	path;
	bodyCache = {};
	constructor(request, path = "/", matchResult = [[]]) {
		this.raw = request;
		this.path = path;
		this.#matchResult = matchResult;
	}
	param(key) {
		return key ? this.#getDecodedParam(key) : this.#getAllDecodedParams();
	}
	#getDecodedParam(key) {
		const paramKey = this.#matchResult[0][this.routeIndex]?.[1][key];
		const param = this.#getParamValue(paramKey);
		return param && tryDecodeURIComponent(param);
	}
	#getAllDecodedParams() {
		const decoded = {};
		const keys = Object.keys(this.#matchResult[0][this.routeIndex]?.[1] ?? {});
		for (const key of keys) {
			const value = this.#getParamValue(this.#matchResult[0][this.routeIndex][1][key]);
			if (value !== void 0) decoded[key] = tryDecodeURIComponent(value);
		}
		return decoded;
	}
	#getParamValue(paramKey) {
		return this.#matchResult[1] ? this.#matchResult[1][paramKey] : paramKey;
	}
	query(key) {
		return getQueryParam(this.url, key);
	}
	queries(key) {
		return getQueryParams(this.url, key);
	}
	header(name) {
		if (name) return this.raw.headers.get(name) ?? void 0;
		const headerData = /* @__PURE__ */ Object.create(null);
		this.raw.headers.forEach((value, key) => {
			headerData[key] = value;
		});
		return headerData;
	}
	async parseBody(options) {
		return parseBody(this, options);
	}
	#cachedBody = (key) => {
		const { bodyCache, raw } = this;
		const cachedBody = bodyCache[key];
		if (cachedBody) return cachedBody;
		for (const anyCachedKey in bodyCache) return bodyCache[anyCachedKey].then((body) => {
			if (anyCachedKey === "json") body = JSON.stringify(body);
			const contentType = anyCachedKey === "formData" ? void 0 : raw.headers.get("content-type");
			return new Response(body, { headers: contentType ? { "Content-Type": contentType } : void 0 })[key]();
		});
		return bodyCache[key] = raw[key]();
	};
	/**
	* `.json()` can parse Request body of type `application/json`
	*
	* @see {@link https://hono.dev/docs/api/request#json}
	*
	* @example
	* ```ts
	* app.post('/entry', async (c) => {
	*   const body = await c.req.json()
	* })
	* ```
	*/
	json() {
		return this.#cachedBody("text").then((text) => JSON.parse(text));
	}
	/**
	* `.text()` can parse Request body of type `text/plain`
	*
	* @see {@link https://hono.dev/docs/api/request#text}
	*
	* @example
	* ```ts
	* app.post('/entry', async (c) => {
	*   const body = await c.req.text()
	* })
	* ```
	*/
	text() {
		return this.#cachedBody("text");
	}
	/**
	* `.arrayBuffer()` parse Request body as an `ArrayBuffer`
	*
	* @see {@link https://hono.dev/docs/api/request#arraybuffer}
	*
	* @example
	* ```ts
	* app.post('/entry', async (c) => {
	*   const body = await c.req.arrayBuffer()
	* })
	* ```
	*/
	arrayBuffer() {
		return this.#cachedBody("arrayBuffer");
	}
	/**
	* `.bytes()` parses the request body as a `Uint8Array`.
	*
	* @see {@link https://hono.dev/docs/api/request#bytes}
	*
	* @example
	* ```ts
	* app.post('/entry', async (c) => {
	*   const body = await c.req.bytes()
	* })
	* ```
	*/
	bytes() {
		return this.#cachedBody("arrayBuffer").then((buffer) => new Uint8Array(buffer));
	}
	/**
	* Parses the request body as a `Blob`.
	* @example
	* ```ts
	* app.post('/entry', async (c) => {
	*   const body = await c.req.blob();
	* });
	* ```
	* @see https://hono.dev/docs/api/request#blob
	*/
	blob() {
		return this.#cachedBody("blob");
	}
	/**
	* Parses the request body as `FormData`.
	* @example
	* ```ts
	* app.post('/entry', async (c) => {
	*   const body = await c.req.formData();
	* });
	* ```
	* @see https://hono.dev/docs/api/request#formdata
	*/
	formData() {
		return this.#cachedBody("formData");
	}
	/**
	* Adds validated data to the request.
	*
	* @param target - The target of the validation.
	* @param data - The validated data to add.
	*/
	addValidatedData(target, data) {
		(this.#validatedData ??= {})[target] = data;
	}
	valid(target) {
		return this.#validatedData?.[target];
	}
	/**
	* `.url()` can get the request url strings.
	*
	* @see {@link https://hono.dev/docs/api/request#url}
	*
	* @example
	* ```ts
	* app.get('/about/me', (c) => {
	*   const url = c.req.url // `http://localhost:8787/about/me`
	*   ...
	* })
	* ```
	*/
	get url() {
		return this.raw.url;
	}
	/**
	* `.method()` can get the method name of the request.
	*
	* @see {@link https://hono.dev/docs/api/request#method}
	*
	* @example
	* ```ts
	* app.get('/about/me', (c) => {
	*   const method = c.req.method // `GET`
	* })
	* ```
	*/
	get method() {
		return this.raw.method;
	}
	get [GET_MATCH_RESULT]() {
		return this.#matchResult;
	}
	/**
	* `.matchedRoutes()` can return a matched route in the handler
	*
	* @deprecated
	*
	* Use matchedRoutes helper defined in "hono/route" instead.
	*
	* @see {@link https://hono.dev/docs/api/request#matchedroutes}
	*
	* @example
	* ```ts
	* app.use('*', async function logger(c, next) {
	*   await next()
	*   c.req.matchedRoutes.forEach(({ handler, method, path }, i) => {
	*     const name = handler.name || (handler.length < 2 ? '[handler]' : '[middleware]')
	*     console.log(
	*       method,
	*       ' ',
	*       path,
	*       ' '.repeat(Math.max(10 - path.length, 0)),
	*       name,
	*       i === c.req.routeIndex ? '<- respond from here' : ''
	*     )
	*   })
	* })
	* ```
	*/
	get matchedRoutes() {
		return this.#matchResult[0].map(([[, route]]) => route);
	}
	/**
	* `routePath()` can retrieve the path registered within the handler
	*
	* @deprecated
	*
	* Use routePath helper defined in "hono/route" instead.
	*
	* @see {@link https://hono.dev/docs/api/request#routepath}
	*
	* @example
	* ```ts
	* app.get('/posts/:id', (c) => {
	*   return c.json({ path: c.req.routePath })
	* })
	* ```
	*/
	get routePath() {
		return this.#matchResult[0].map(([[, route]]) => route)[this.routeIndex].path;
	}
};
//#endregion
//#region node_modules/hono/dist/utils/html.js
var HtmlEscapedCallbackPhase = {
	Stringify: 1,
	BeforeStream: 2,
	Stream: 3
};
var raw = (value, callbacks) => {
	const escapedString = new String(value);
	escapedString.isEscaped = true;
	escapedString.callbacks = callbacks;
	return escapedString;
};
var resolveCallback = async (str, phase, preserveCallbacks, context, buffer) => {
	if (typeof str === "object" && !(str instanceof String)) {
		if (!(str instanceof Promise)) str = str.toString();
		if (str instanceof Promise) str = await str;
	}
	const callbacks = str.callbacks;
	if (!callbacks?.length) return Promise.resolve(str);
	if (buffer) buffer[0] += str;
	else buffer = [str];
	const resStr = Promise.all(callbacks.map((c) => c({
		phase,
		buffer,
		context
	}))).then((res) => Promise.all(res.filter(Boolean).map((str2) => resolveCallback(str2, phase, false, context, buffer))).then(() => buffer[0]));
	if (preserveCallbacks) return raw(await resStr, callbacks);
	else return resStr;
};
//#endregion
//#region node_modules/hono/dist/context.js
var TEXT_PLAIN = "text/plain; charset=UTF-8";
var setDefaultContentType = (contentType, headers) => {
	return {
		"Content-Type": contentType,
		...headers
	};
};
var createResponseInstance = (body, init) => new Response(body, init);
var Context = class {
	#rawRequest;
	#req;
	/**
	* `.env` can get bindings (environment variables, secrets, KV namespaces, D1 database, R2 bucket etc.) in Cloudflare Workers.
	*
	* @see {@link https://hono.dev/docs/api/context#env}
	*
	* @example
	* ```ts
	* // Environment object for Cloudflare Workers
	* app.get('*', async c => {
	*   const counter = c.env.COUNTER
	* })
	* ```
	*/
	env = {};
	#var;
	finalized = false;
	/**
	* `.error` can get the error object from the middleware if the Handler throws an error.
	*
	* @see {@link https://hono.dev/docs/api/context#error}
	*
	* @example
	* ```ts
	* app.use('*', async (c, next) => {
	*   await next()
	*   if (c.error) {
	*     // do something...
	*   }
	* })
	* ```
	*/
	error;
	#status;
	#executionCtx;
	#res;
	#layout;
	#renderer;
	#notFoundHandler;
	#preparedHeaders;
	#matchResult;
	#path;
	/**
	* Creates an instance of the Context class.
	*
	* @param req - The Request object.
	* @param options - Optional configuration options for the context.
	*/
	constructor(req, options) {
		this.#rawRequest = req;
		if (options) {
			this.#executionCtx = options.executionCtx;
			this.env = options.env;
			this.#notFoundHandler = options.notFoundHandler;
			this.#path = options.path;
			this.#matchResult = options.matchResult;
		}
	}
	/**
	* `.req` is the instance of {@link HonoRequest}.
	*/
	get req() {
		this.#req ??= new HonoRequest(this.#rawRequest, this.#path, this.#matchResult);
		return this.#req;
	}
	/**
	* @see {@link https://hono.dev/docs/api/context#event}
	* The FetchEvent associated with the current request.
	*
	* @throws Will throw an error if the context does not have a FetchEvent.
	*/
	get event() {
		if (this.#executionCtx && "respondWith" in this.#executionCtx) return this.#executionCtx;
		else throw Error("This context has no FetchEvent");
	}
	/**
	* @see {@link https://hono.dev/docs/api/context#executionctx}
	* The ExecutionContext associated with the current request.
	*
	* @throws Will throw an error if the context does not have an ExecutionContext.
	*/
	get executionCtx() {
		if (this.#executionCtx) return this.#executionCtx;
		else throw Error("This context has no ExecutionContext");
	}
	/**
	* @see {@link https://hono.dev/docs/api/context#res}
	* The Response object for the current request.
	*/
	get res() {
		return this.#res ||= createResponseInstance(null, { headers: this.#preparedHeaders ??= new Headers() });
	}
	/**
	* Sets the Response object for the current request.
	*
	* @param _res - The Response object to set.
	*/
	set res(_res) {
		if (this.#res && _res) {
			_res = createResponseInstance(_res.body, _res);
			for (const [k, v] of this.#res.headers.entries()) {
				if (k === "content-type") continue;
				if (k === "set-cookie") {
					const cookies = this.#res.headers.getSetCookie();
					_res.headers.delete("set-cookie");
					for (const cookie of cookies) _res.headers.append("set-cookie", cookie);
				} else _res.headers.set(k, v);
			}
		}
		this.#res = _res;
		this.finalized = true;
	}
	/**
	* `.render()` can create a response within a layout.
	*
	* @see {@link https://hono.dev/docs/api/context#render-setrenderer}
	*
	* @example
	* ```ts
	* app.get('/', (c) => {
	*   return c.render('Hello!')
	* })
	* ```
	*/
	render = (...args) => {
		this.#renderer ??= (content) => this.html(content);
		return this.#renderer(...args);
	};
	/**
	* Sets the layout for the response.
	*
	* @param layout - The layout to set.
	* @returns The layout function.
	*/
	setLayout = (layout) => this.#layout = layout;
	/**
	* Gets the current layout for the response.
	*
	* @returns The current layout function.
	*/
	getLayout = () => this.#layout;
	/**
	* `.setRenderer()` can set the layout in the custom middleware.
	*
	* @see {@link https://hono.dev/docs/api/context#render-setrenderer}
	*
	* @example
	* ```tsx
	* app.use('*', async (c, next) => {
	*   c.setRenderer((content) => {
	*     return c.html(
	*       <html>
	*         <body>
	*           <p>{content}</p>
	*         </body>
	*       </html>
	*     )
	*   })
	*   await next()
	* })
	* ```
	*/
	setRenderer = (renderer) => {
		this.#renderer = renderer;
	};
	/**
	* `.header()` can set headers.
	*
	* @see {@link https://hono.dev/docs/api/context#header}
	*
	* @example
	* ```ts
	* app.get('/welcome', (c) => {
	*   // Set headers
	*   c.header('X-Message', 'Hello!')
	*   c.header('Content-Type', 'text/plain')
	*
	*   // Append multiple headers using the append option (e.g. Vary)
	*   c.header('Vary', 'Accept-Encoding', { append: true })
	*   c.header('Vary', 'User-Agent', { append: true })
	*
	*   return c.body('Thank you for coming')
	* })
	* ```
	*/
	header = (name, value, options) => {
		if (this.finalized) this.#res = createResponseInstance(this.#res.body, this.#res);
		const headers = this.#res ? this.#res.headers : this.#preparedHeaders ??= new Headers();
		if (value === void 0) headers.delete(name);
		else if (options?.append) headers.append(name, value);
		else headers.set(name, value);
	};
	status = (status) => {
		this.#status = status;
	};
	/**
	* `.set()` can set the value specified by the key.
	*
	* @see {@link https://hono.dev/docs/api/context#set-get}
	*
	* @example
	* ```ts
	* app.use('*', async (c, next) => {
	*   c.set('message', 'Hono is hot!!')
	*   await next()
	* })
	* ```
	*/
	set = (key, value) => {
		this.#var ??= /* @__PURE__ */ new Map();
		this.#var.set(key, value);
	};
	/**
	* `.get()` can use the value specified by the key.
	*
	* @see {@link https://hono.dev/docs/api/context#set-get}
	*
	* @example
	* ```ts
	* app.get('/', (c) => {
	*   const message = c.get('message')
	*   return c.text(`The message is "${message}"`)
	* })
	* ```
	*/
	get = (key) => {
		return this.#var ? this.#var.get(key) : void 0;
	};
	/**
	* `.var` can access the value of a variable.
	*
	* @see {@link https://hono.dev/docs/api/context#var}
	*
	* @example
	* ```ts
	* const result = c.var.client.oneMethod()
	* ```
	*/
	get var() {
		if (!this.#var) return {};
		return Object.fromEntries(this.#var);
	}
	#newResponse(data, arg, headers) {
		let responseHeaders = this.#res ? new Headers(this.#res.headers) : this.#preparedHeaders;
		if (typeof arg === "object" && arg.headers) {
			responseHeaders ??= new Headers();
			for (const [key, value] of new Headers(arg.headers)) if (key === "set-cookie") responseHeaders.append(key, value);
			else responseHeaders.set(key, value);
		}
		if (headers) {
			if (!responseHeaders) {
				let count = 0;
				for (const k in headers) if (++count > 1 || typeof headers[k] !== "string") {
					responseHeaders = new Headers();
					break;
				}
			}
			if (responseHeaders) for (const k in headers) {
				const v = headers[k];
				if (typeof v === "string") responseHeaders.set(k, v);
				else {
					responseHeaders.delete(k);
					for (const v2 of v) responseHeaders.append(k, v2);
				}
			}
		}
		return createResponseInstance(data, {
			status: typeof arg === "number" ? arg : arg?.status ?? this.#status,
			headers: responseHeaders ?? headers
		});
	}
	newResponse = (...args) => this.#newResponse(...args);
	/**
	* `.body()` can return the HTTP response.
	* You can set headers with `.header()` and set HTTP status code with `.status`.
	* This can also be set in `.text()`, `.json()` and so on.
	*
	* @see {@link https://hono.dev/docs/api/context#body}
	*
	* @example
	* ```ts
	* app.get('/welcome', (c) => {
	*   // Set headers
	*   c.header('X-Message', 'Hello!')
	*   c.header('Content-Type', 'text/plain')
	*   // Set HTTP status code
	*   c.status(201)
	*
	*   // Return the response body
	*   return c.body('Thank you for coming')
	* })
	* ```
	*/
	body = (data, arg, headers) => this.#newResponse(data, arg, headers);
	/**
	* `.text()` can render text as `Content-Type:text/plain`.
	*
	* @see {@link https://hono.dev/docs/api/context#text}
	*
	* @example
	* ```ts
	* app.get('/say', (c) => {
	*   return c.text('Hello!')
	* })
	* ```
	*/
	text = (text, arg, headers) => {
		return !this.#preparedHeaders && !this.#status && !arg && !headers && !this.finalized ? new Response(text) : this.#newResponse(text, arg, setDefaultContentType(TEXT_PLAIN, headers));
	};
	/**
	* `.json()` can render JSON as `Content-Type:application/json`.
	*
	* @see {@link https://hono.dev/docs/api/context#json}
	*
	* @example
	* ```ts
	* app.get('/api', (c) => {
	*   return c.json({ message: 'Hello!' })
	* })
	* ```
	*/
	json = (object, arg, headers) => {
		return this.#newResponse(JSON.stringify(object), arg, setDefaultContentType("application/json", headers));
	};
	html = (html, arg, headers) => {
		const res = (html2) => this.#newResponse(html2, arg, setDefaultContentType("text/html; charset=UTF-8", headers));
		return typeof html === "object" ? resolveCallback(html, HtmlEscapedCallbackPhase.Stringify, false, {}).then(res) : res(html);
	};
	/**
	* `.redirect()` can Redirect, default status code is 302.
	*
	* @see {@link https://hono.dev/docs/api/context#redirect}
	*
	* @example
	* ```ts
	* app.get('/redirect', (c) => {
	*   return c.redirect('/')
	* })
	* app.get('/redirect-permanently', (c) => {
	*   return c.redirect('/', 301)
	* })
	* ```
	*/
	redirect = (location, status) => {
		const locationString = String(location);
		this.header("Location", !/[^\x00-\xFF]/.test(locationString) ? locationString : encodeURI(locationString));
		return this.newResponse(null, status ?? 302);
	};
	/**
	* `.notFound()` can return the Not Found Response.
	*
	* @see {@link https://hono.dev/docs/api/context#notfound}
	*
	* @example
	* ```ts
	* app.get('/notfound', (c) => {
	*   return c.notFound()
	* })
	* ```
	*/
	notFound = () => {
		this.#notFoundHandler ??= () => createResponseInstance();
		return this.#notFoundHandler(this);
	};
};
//#endregion
//#region node_modules/hono/dist/router.js
var METHODS = [
	"get",
	"post",
	"put",
	"delete",
	"options",
	"patch",
	"query"
];
var MESSAGE_MATCHER_IS_ALREADY_BUILT = "Can not add a route since the matcher is already built.";
var UnsupportedPathError = class extends Error {};
//#endregion
//#region node_modules/hono/dist/utils/constants.js
var COMPOSED_HANDLER = "__COMPOSED_HANDLER";
//#endregion
//#region node_modules/hono/dist/hono-base.js
var notFoundHandler = (c) => {
	return c.text("404 Not Found", 404);
};
var errorHandler = (err, c) => {
	if ("getResponse" in err) {
		const res = err.getResponse();
		return c.newResponse(res.body, res);
	}
	console.error(err);
	return c.text("Internal Server Error", 500);
};
var Hono$1 = class _Hono {
	get;
	post;
	put;
	delete;
	options;
	patch;
	query;
	all;
	on;
	use;
	router;
	getPath;
	_basePath = "/";
	#path = "/";
	routes = [];
	constructor(options = {}) {
		[...METHODS, "all"].forEach((method) => {
			this[method] = (args1, ...args) => {
				const methodName = method.toUpperCase();
				if (typeof args1 === "string") this.#path = args1;
				else this.#addRoute(methodName, this.#path, args1);
				args.forEach((handler) => {
					this.#addRoute(methodName, this.#path, handler);
				});
				return this;
			};
		});
		this.on = (method, path, ...handlers) => {
			for (const p of [path].flat()) {
				this.#path = p;
				for (const m of [method].flat()) {
					const methodName = m.toUpperCase();
					for (const handler of handlers) this.#addRoute(methodName, this.#path, handler);
				}
			}
			return this;
		};
		this.use = (arg1, ...handlers) => {
			if (typeof arg1 === "string") this.#path = arg1;
			else {
				this.#path = "*";
				handlers.unshift(arg1);
			}
			handlers.forEach((handler) => {
				this.#addRoute("ALL", this.#path, handler);
			});
			return this;
		};
		const { strict, ...optionsWithoutStrict } = options;
		Object.assign(this, optionsWithoutStrict);
		this.getPath = strict ?? true ? options.getPath ?? getPath : getPathNoStrict;
	}
	#clone() {
		const clone = new _Hono({
			router: this.router,
			getPath: this.getPath
		});
		clone.errorHandler = this.errorHandler;
		clone.#notFoundHandler = this.#notFoundHandler;
		clone.routes = this.routes;
		return clone;
	}
	#notFoundHandler = notFoundHandler;
	errorHandler = errorHandler;
	/**
	* `.route()` allows grouping other Hono instance in routes.
	*
	* @see {@link https://hono.dev/docs/api/routing#grouping}
	*
	* @param {string} path - base Path
	* @param {Hono} app - other Hono instance
	* @returns {Hono} routed Hono instance
	*
	* @example
	* ```ts
	* const app = new Hono()
	* const app2 = new Hono()
	*
	* app2.get("/user", (c) => c.text("user"))
	* app.route("/api", app2) // GET /api/user
	* ```
	*/
	route(path, app) {
		const subApp = this.basePath(path);
		app.routes.map((r) => {
			let handler;
			if (app.errorHandler === errorHandler) handler = r.handler;
			else {
				handler = async (c, next) => (await compose([], app.errorHandler)(c, () => r.handler(c, next))).res;
				handler[COMPOSED_HANDLER] = r.handler;
			}
			subApp.#addRoute(r.method, r.path, handler, r.basePath);
		});
		return this;
	}
	/**
	* `.basePath()` allows base paths to be specified.
	*
	* @see {@link https://hono.dev/docs/api/routing#base-path}
	*
	* @param {string} path - base Path
	* @returns {Hono} changed Hono instance
	*
	* @example
	* ```ts
	* const api = new Hono().basePath('/api')
	* ```
	*/
	basePath(path) {
		const subApp = this.#clone();
		subApp._basePath = mergePath(this._basePath, path);
		return subApp;
	}
	/**
	* `.onError()` handles an error and returns a customized Response.
	*
	* @see {@link https://hono.dev/docs/api/hono#error-handling}
	*
	* @param {ErrorHandler} handler - request Handler for error
	* @returns {Hono} changed Hono instance
	*
	* @example
	* ```ts
	* app.onError((err, c) => {
	*   console.error(`${err}`)
	*   return c.text('Custom Error Message', 500)
	* })
	* ```
	*/
	onError = (handler) => {
		this.errorHandler = handler;
		return this;
	};
	/**
	* `.notFound()` allows you to customize a Not Found Response.
	*
	* @see {@link https://hono.dev/docs/api/hono#not-found}
	*
	* @param {NotFoundHandler} handler - request handler for not-found
	* @returns {Hono} changed Hono instance
	*
	* @example
	* ```ts
	* app.notFound((c) => {
	*   return c.text('Custom 404 Message', 404)
	* })
	* ```
	*/
	notFound = (handler) => {
		this.#notFoundHandler = handler;
		return this;
	};
	/**
	* `.mount()` allows you to mount applications built with other frameworks into your Hono application.
	*
	* @see {@link https://hono.dev/docs/api/hono#mount}
	*
	* @param {string} path - base Path
	* @param {Function} applicationHandler - other Request Handler
	* @param {MountOptions} [options] - options of `.mount()`
	* @returns {Hono} mounted Hono instance
	*
	* @example
	* ```ts
	* import { Router as IttyRouter } from 'itty-router'
	* import { Hono } from 'hono'
	* // Create itty-router application
	* const ittyRouter = IttyRouter()
	* // GET /itty-router/hello
	* ittyRouter.get('/hello', () => new Response('Hello from itty-router'))
	*
	* const app = new Hono()
	* app.mount('/itty-router', ittyRouter.handle)
	* ```
	*
	* @example
	* ```ts
	* const app = new Hono()
	* // Send the request to another application without modification.
	* app.mount('/app', anotherApp, {
	*   replaceRequest: (req) => req,
	* })
	* ```
	*/
	mount(path, applicationHandler, options) {
		let replaceRequest;
		let optionHandler;
		if (options) {
			if (typeof options === "function") optionHandler = options;
			else {
				optionHandler = options.optionHandler;
				if (options.replaceRequest === false) replaceRequest = (request) => request;
				else replaceRequest = options.replaceRequest;
			}
		}
		const getOptions = optionHandler ? (c) => {
			const options2 = optionHandler(c);
			return Array.isArray(options2) ? options2 : [options2];
		} : (c) => {
			let executionContext = void 0;
			try {
				executionContext = c.executionCtx;
			} catch {}
			return [c.env, executionContext];
		};
		replaceRequest ||= (() => {
			const mergedPath = mergePath(this._basePath, path);
			const pathPrefixLength = mergedPath === "/" ? 0 : mergedPath.length;
			return (request) => {
				const url = new URL(request.url);
				url.pathname = this.getPath(request).slice(pathPrefixLength) || "/";
				return new Request(url, request);
			};
		})();
		const handler = async (c, next) => {
			const res = await applicationHandler(replaceRequest(c.req.raw), ...getOptions(c));
			if (res) return res;
			await next();
		};
		this.#addRoute("ALL", mergePath(path, "*"), handler);
		return this;
	}
	#addRoute(method, path, handler, baseRoutePath) {
		path = mergePath(this._basePath, path);
		const r = {
			basePath: baseRoutePath !== void 0 ? mergePath(this._basePath, baseRoutePath) : this._basePath,
			path,
			method,
			handler
		};
		this.router.add(method, path, [handler, r]);
		this.routes.push(r);
	}
	#handleError(err, c) {
		if (err instanceof Error) return this.errorHandler(err, c);
		throw err;
	}
	#dispatch(request, executionCtx, env, method) {
		if (method === "HEAD") return (async () => new Response(null, await this.#dispatch(request, executionCtx, env, "GET")))();
		const path = this.getPath(request, { env });
		const matchResult = this.router.match(method, path);
		const c = new Context(request, {
			path,
			matchResult,
			env,
			executionCtx,
			notFoundHandler: this.#notFoundHandler
		});
		if (matchResult[0].length === 1) {
			let res;
			try {
				res = matchResult[0][0][0][0](c, async () => {
					c.res = await this.#notFoundHandler(c);
				});
			} catch (err) {
				return this.#handleError(err, c);
			}
			return res instanceof Promise ? res.then((resolved) => resolved || (c.finalized ? c.res : this.#notFoundHandler(c))).catch((err) => this.#handleError(err, c)) : res ?? this.#notFoundHandler(c);
		}
		const composed = compose(matchResult[0], this.errorHandler, this.#notFoundHandler);
		return (async () => {
			try {
				const context = await composed(c);
				if (!context.finalized) throw new Error("Context is not finalized. Did you forget to return a Response object or `await next()`?");
				return context.res;
			} catch (err) {
				return this.#handleError(err, c);
			}
		})();
	}
	/**
	* `.fetch()` will be entry point of your app.
	*
	* @see {@link https://hono.dev/docs/api/hono#fetch}
	*
	* @param {Request} request - request Object of request
	* @param {Env} env - env Object
	* @param {ExecutionContext} executionCtx - context of execution
	* @returns {Response | Promise<Response>} response of request
	*
	*/
	fetch = (request, ...rest) => {
		return this.#dispatch(request, rest[1], rest[0], request.method);
	};
	/**
	* `.request()` is a useful method for testing.
	* You can pass a URL or pathname to send a GET request.
	* app will return a Response object.
	* ```ts
	* test('GET /hello is ok', async () => {
	*   const res = await app.request('/hello')
	*   expect(res.status).toBe(200)
	* })
	* ```
	* @see https://hono.dev/docs/api/hono#request
	*/
	request = (input, requestInit, Env, executionCtx) => {
		if (input instanceof Request) return this.fetch(requestInit ? new Request(input, requestInit) : input, Env, executionCtx);
		input = input.toString();
		return this.fetch(new Request(/^https?:\/\//.test(input) ? input : `http://localhost${mergePath("/", input)}`, requestInit), Env, executionCtx);
	};
	/**
	* `.fire()` automatically adds a global fetch event listener.
	* This can be useful for environments that adhere to the Service Worker API, such as non-ES module Cloudflare Workers.
	* @deprecated
	* Use `fire` from `hono/service-worker` instead.
	* ```ts
	* import { Hono } from 'hono'
	* import { fire } from 'hono/service-worker'
	*
	* const app = new Hono()
	* // ...
	* fire(app)
	* ```
	* @see https://hono.dev/docs/api/hono#fire
	* @see https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API
	* @see https://developers.cloudflare.com/workers/reference/migrate-to-module-workers/
	*/
	fire = () => {
		addEventListener("fetch", (event) => {
			event.respondWith(this.#dispatch(event.request, event, void 0, event.request.method));
		});
	};
};
//#endregion
//#region node_modules/hono/dist/router/utils.js
var createNullObject = () => /* @__PURE__ */ Object.create(null);
//#endregion
//#region node_modules/hono/dist/router/reg-exp-router/matcher.js
var emptyParam = [];
function match(method, path) {
	const matchers = this.buildAllMatchers();
	const match2 = ((method2, path2) => {
		const matcher = matchers[method2] || matchers["ALL"];
		const staticMatch = matcher[2][path2];
		if (staticMatch) return staticMatch;
		const match3 = path2.match(matcher[0]);
		if (!match3) return [[], emptyParam];
		const index = match3.indexOf("", 1);
		return [matcher[1][index], match3];
	});
	this.match = match2;
	return match2(method, path);
}
//#endregion
//#region node_modules/hono/dist/router/reg-exp-router/node.js
var LABEL_REG_EXP_STR = "[^/]+";
var TAIL_WILDCARD_REG_EXP_STR = "(?:|/.*)";
var PATH_ERROR = /* @__PURE__ */ Symbol();
var regExpMetaChars = /* @__PURE__ */ new Set(".\\+*[^]$()");
function compareKey(a, b) {
	if (a.length === 1) return b.length === 1 ? a < b ? -1 : 1 : -1;
	if (b.length === 1) return 1;
	if (a === ".*" || a === "(?:|/.*)") return b === "(?:|/.*)" ? -1 : 1;
	else if (b === ".*" || b === "(?:|/.*)") return -1;
	if (a === "[^/]+") return 1;
	else if (b === "[^/]+") return -1;
	return a.length === b.length ? a < b ? -1 : 1 : b.length - a.length;
}
var Node$1 = class _Node {
	#index;
	#varIndex;
	#children = createNullObject();
	insert(tokens, index, paramMap, context, isStatic) {
		let node = this;
		for (let i = 0, len = tokens.length; i < len; i++) {
			const token = tokens[i];
			const pattern = token.length === 1 ? token === "*" ? i === len - 1 ? [
				"",
				"",
				".*"
			] : [
				"",
				"",
				LABEL_REG_EXP_STR
			] : null : token === "/*" ? [
				"",
				"",
				TAIL_WILDCARD_REG_EXP_STR
			] : token.match(/^\:([^\{\}]+)(?:\{(.+)\})?$/);
			let nextNode;
			if (pattern) {
				const name = pattern[1];
				let regexpStr = pattern[2] || "[^/]+";
				if (name && pattern[2]) {
					if (regexpStr === ".*") throw PATH_ERROR;
					regexpStr = regexpStr.replace(/^\((?!\?:)(?=[^)]+\)$)/, "(?:");
					if (/\((?!\?:)/.test(regexpStr)) throw PATH_ERROR;
					if (regexpStr.length === 1 && regExpMetaChars.has(regexpStr)) throw PATH_ERROR;
				}
				nextNode = node.#children[regexpStr];
				if (!nextNode) {
					if (regexpStr !== ".*" && regexpStr !== "(?:|/.*)") {
						for (const k in node.#children) if ((regexpStr.length > 1 || k.length > 1) && k !== ".*" && k !== "(?:|/.*)") throw PATH_ERROR;
					}
					nextNode = node.#children[regexpStr] = new _Node();
				}
				if (name !== "") {
					nextNode.#varIndex ??= context.varIndex++;
					paramMap.push([name, nextNode.#varIndex]);
				}
			} else {
				nextNode = node.#children[token];
				if (!nextNode) {
					for (const k in node.#children) if (k.length > 1 && k !== ".*" && k !== "(?:|/.*)") throw PATH_ERROR;
					nextNode = node.#children[token] = new _Node();
				}
			}
			node = nextNode;
		}
		if (node.#index !== void 0) throw PATH_ERROR;
		node.#index = isStatic ? -1 : index;
	}
	buildRegExpStr() {
		const strList = Object.keys(this.#children).sort(compareKey).map((k) => {
			const c = this.#children[k];
			const childStr = c.buildRegExpStr();
			return childStr === "" ? "" : (typeof c.#varIndex === "number" ? `(${k})@${c.#varIndex}` : regExpMetaChars.has(k) ? `\\${k}` : k) + childStr;
		}).filter(Boolean);
		if (typeof this.#index === "number" && this.#index !== -1) strList.unshift(`#${this.#index}`);
		if (strList.length === 0) return "";
		if (strList.length === 1) return strList[0];
		return "(?:" + strList.join("|") + ")";
	}
};
//#endregion
//#region node_modules/hono/dist/router/reg-exp-router/trie.js
var Trie = class {
	#context = { varIndex: 0 };
	#root = new Node$1();
	#index = 0;
	paths = createNullObject();
	insert(path, isStatic) {
		if (isStatic) {
			this.#root.insert(path.split(""), 0, [], this.#context, true);
			return;
		}
		const paramAssoc = [];
		const groups = [];
		let markedPath = path;
		for (let i = 0;;) {
			let replaced = false;
			markedPath = markedPath.replace(/\{[^}]+\}/g, (m) => {
				const mark = `@\\${i}`;
				groups[i] = [mark, m];
				i++;
				replaced = true;
				return mark;
			});
			if (!replaced) break;
		}
		const tokens = markedPath.match(/(?::[^\/]+)|(?:\/\*$)|./g) || [];
		for (let i = groups.length - 1; i >= 0; i--) {
			const [mark] = groups[i];
			for (let j = tokens.length - 1; j >= 0; j--) if (tokens[j].indexOf(mark) !== -1) {
				tokens[j] = tokens[j].replace(mark, groups[i][1]);
				break;
			}
		}
		this.#root.insert(tokens, this.#index, paramAssoc, this.#context, false);
		this.paths[path] = [this.#index++, paramAssoc];
	}
	buildRegExp() {
		let regexp = this.#root.buildRegExpStr();
		if (regexp === "") return [
			/^$/,
			[],
			[]
		];
		let captureIndex = 0;
		const indexReplacementMap = [];
		const paramReplacementMap = [];
		regexp = regexp.replace(/#(\d+)|@(\d+)|\.\*\$/g, (_, handlerIndex, paramIndex) => {
			if (handlerIndex !== void 0) {
				indexReplacementMap[++captureIndex] = Number(handlerIndex);
				return "$()";
			}
			if (paramIndex !== void 0) {
				paramReplacementMap[Number(paramIndex)] = ++captureIndex;
				return "";
			}
			return "";
		});
		return [
			new RegExp(`^${regexp}`),
			indexReplacementMap,
			paramReplacementMap
		];
	}
};
//#endregion
//#region node_modules/hono/dist/router/reg-exp-router/router.js
var wildcardRegExpCache = createNullObject();
function buildWildcardRegExp(path) {
	return wildcardRegExpCache[path] ??= new RegExp(`^${path.replace(/\/:[^/{}]+(?:\{\[\^\/]\+})?(?=[/{]|$)|\/?\*$|([.\\+*[^\]$()?{}|])/g, (match2, metaChar) => metaChar ? `\\${metaChar}` : match2 === "/*" ? TAIL_WILDCARD_REG_EXP_STR : match2 === "*" ? ".*" : `/:${LABEL_REG_EXP_STR}`)}$`);
}
function findMiddleware(middleware, path) {
	for (const k of Object.keys(middleware).sort((a, b) => b.length - a.length)) if (buildWildcardRegExp(k).test(path)) return [...middleware[k]];
}
var RegExpRouter = class {
	name = "RegExpRouter";
	#middleware;
	#routes;
	#tries;
	constructor() {
		this.#middleware = { ["ALL"]: createNullObject() };
		this.#routes = { ["ALL"]: createNullObject() };
		this.#tries = { ["ALL"]: new Trie() };
	}
	#insertPath(method, path) {
		try {
			this.#tries[method].insert(path, !/\*|\/:/.test(path));
		} catch (e) {
			throw e === PATH_ERROR ? new UnsupportedPathError(path) : e;
		}
	}
	add(method, path, handler) {
		const middleware = this.#middleware;
		const routes = this.#routes;
		if (!middleware) throw new Error(MESSAGE_MATCHER_IS_ALREADY_BUILT);
		if (!middleware[method]) {
			this.#tries[method] = new Trie();
			for (const handlerMap of [middleware, routes]) {
				handlerMap[method] = createNullObject();
				for (const p in handlerMap["ALL"]) {
					handlerMap[method][p] = [...handlerMap["ALL"][p]];
					this.#insertPath(method, p);
				}
			}
		}
		if (path === "/*") path = "*";
		const methods = method === "ALL" ? Object.keys(middleware) : [method];
		if (/\*$/.test(path)) {
			const re = buildWildcardRegExp(path);
			for (const m of methods) if (!middleware[m][path]) {
				this.#insertPath(m, path);
				middleware[m][path] = findMiddleware(middleware[m], path) || findMiddleware(middleware["ALL"], path) || [];
			}
			for (const handlerMap of [middleware, routes]) for (const m of methods) for (const p in handlerMap[m]) re.test(p) && handlerMap[m][p].push([handler, path]);
			return;
		}
		const paths = checkOptionalParameter(path) || [path];
		for (const path2 of paths) for (const m of methods) {
			if (!routes[m][path2]) {
				this.#insertPath(m, path2);
				routes[m][path2] = findMiddleware(middleware[m], path2) || findMiddleware(middleware["ALL"], path2) || [];
			}
			routes[m][path2].push([handler, path2]);
		}
	}
	match = match;
	buildAllMatchers() {
		const matchers = createNullObject();
		for (const method of Object.keys(this.#routes)) matchers[method] = this.#buildMatcher(method);
		this.#middleware = this.#routes = this.#tries = void 0;
		wildcardRegExpCache = createNullObject();
		return matchers;
	}
	#buildMatcher(method) {
		const middleware = this.#middleware[method];
		const routes = this.#routes[method];
		const trie = this.#tries[method];
		const staticMap = createNullObject();
		const handlerData = [];
		const [regexp, indexReplacementMap, paramReplacementMap] = trie.buildRegExp();
		for (const r of [middleware, routes]) for (const path in r) {
			const handlers = r[path];
			const pathData = trie.paths[path];
			if (!pathData) {
				staticMap[path] = [handlers.map(([h]) => [h, createNullObject()]), emptyParam];
				continue;
			}
			handlerData[pathData[0]] = handlers.map(([h, handlerPath]) => [h, trie.paths[handlerPath][1].reduceRight((map, [key], i) => {
				map[key] = paramReplacementMap[pathData[1][i][1]];
				return map;
			}, createNullObject())]);
		}
		return [
			regexp,
			indexReplacementMap.map((i) => handlerData[i]),
			staticMap
		];
	}
};
//#endregion
//#region node_modules/hono/dist/router/smart-router/router.js
var SmartRouter = class {
	name = "SmartRouter";
	#routers = [];
	#routes = [];
	constructor(init) {
		this.#routers = init.routers;
	}
	add(method, path, handler) {
		if (!this.#routes) throw new Error(MESSAGE_MATCHER_IS_ALREADY_BUILT);
		this.#routes.push([
			method,
			path,
			handler
		]);
	}
	match(method, path) {
		if (!this.#routes) throw new Error("Fatal error");
		const routers = this.#routers;
		const routes = this.#routes;
		const len = routers.length;
		let i = 0;
		let res;
		for (; i < len; i++) {
			const router = routers[i];
			try {
				for (let i2 = 0, len2 = routes.length; i2 < len2; i2++) router.add(...routes[i2]);
				res = router.match(method, path);
			} catch (e) {
				if (e instanceof UnsupportedPathError) continue;
				throw e;
			}
			this.match = router.match.bind(router);
			this.#routers = [router];
			this.#routes = void 0;
			break;
		}
		if (i === len) throw new Error("Fatal error");
		this.name = `SmartRouter + ${this.activeRouter.name}`;
		return res;
	}
	get activeRouter() {
		if (this.#routes || this.#routers.length !== 1) throw new Error("No active router has been determined yet.");
		return this.#routers[0];
	}
};
//#endregion
//#region node_modules/hono/dist/router/trie-router/node.js
var emptyParams = createNullObject();
var order = 0;
var Node = class _Node {
	#methods = [];
	#children = createNullObject();
	#patterns = [];
	#pattern;
	#params = emptyParams;
	insert(method, path, handler) {
		let curNode = this;
		const parts = splitRoutingPath(path);
		const possibleKeys = /* @__PURE__ */ new Set();
		let i = 0;
		for (const p of parts) {
			const nextP = parts[++i];
			const pattern = getPattern(p, nextP) || (nextP === void 0 && p && p.indexOf("*") === p.length - 1 ? p : null);
			const isParam = Array.isArray(pattern);
			const key = isParam ? pattern[0] : pattern || p;
			const child = curNode.#children[key] ||= new _Node();
			if (pattern && !child.#pattern) {
				child.#pattern = pattern;
				curNode.#patterns.push(child);
			}
			curNode = child;
			if (isParam) possibleKeys.add(pattern[1]);
		}
		curNode.#methods.push({ [method]: {
			handler,
			possibleKeys: [...possibleKeys],
			score: ++order
		} });
	}
	#pushHandlerSets(handlerSets, node, method, nodeParams, params) {
		for (let i = 0, len = node.#methods.length; i < len; i++) {
			const m = node.#methods[i];
			const handlerSet = m[method] || m["ALL"];
			if (handlerSet) {
				handlerSet.params = createNullObject();
				handlerSets.push(handlerSet);
				for (let i2 = 0, len2 = handlerSet.possibleKeys.length; i2 < len2; i2++) {
					const key = handlerSet.possibleKeys[i2];
					handlerSet.params[key] = params?.[key] && !i2 ? params[key] : nodeParams[key] ?? params?.[key];
				}
			}
		}
	}
	search(method, path) {
		const handlerSets = [];
		this.#params = emptyParams;
		let curNodes = [this];
		const parts = splitPath(path);
		const curNodesQueue = [];
		const len = parts.length;
		let partOffsets = null;
		for (let i = 0; i < len; i++) {
			const part = parts[i];
			const isLast = i === len - 1;
			const tempNodes = [];
			for (let j = 0, len2 = curNodes.length; j < len2; j++) {
				const node = curNodes[j];
				const nextNode = node.#children[part];
				if (nextNode) {
					nextNode.#params = node.#params;
					if (isLast) {
						if (nextNode.#children["*"]) this.#pushHandlerSets(handlerSets, nextNode.#children["*"], method, node.#params);
						this.#pushHandlerSets(handlerSets, nextNode, method, node.#params);
					} else tempNodes.push(nextNode);
				}
				for (const child of node.#patterns) {
					const pattern = child.#pattern;
					const params = node.#params === emptyParams ? {} : { ...node.#params };
					if (typeof pattern === "string") {
						if (pattern === "*" || part.startsWith(pattern.slice(0, -1))) {
							this.#pushHandlerSets(handlerSets, child, method, node.#params);
							if (pattern === "*") {
								child.#params = params;
								tempNodes.push(child);
							}
						}
						continue;
					}
					const [, name, matcher] = pattern;
					if (!part && matcher === true) continue;
					if (matcher !== true) {
						if (!partOffsets) {
							partOffsets = [];
							let offset = path[0] === "/" ? 1 : 0;
							for (let p = 0; p < len; p++) {
								partOffsets[p] = offset;
								offset += parts[p].length + 1;
							}
						}
						const restPathString = path.slice(partOffsets[i]);
						const m = matcher.exec(restPathString);
						if (m) {
							params[name] = m[0];
							this.#pushHandlerSets(handlerSets, child, method, node.#params, params);
							if (m[0].length === restPathString.length && child.#children["*"]) this.#pushHandlerSets(handlerSets, child.#children["*"], method, node.#params, params);
							for (const _ in child.#children) {
								child.#params = params;
								const componentCount = m[0].match(/\//g)?.length ?? 0;
								(curNodesQueue[componentCount] ||= []).push(child);
								break;
							}
							continue;
						}
					}
					if (matcher === true || matcher.test(part)) {
						params[name] = part;
						if (isLast) {
							this.#pushHandlerSets(handlerSets, child, method, params, node.#params);
							if (child.#children["*"]) this.#pushHandlerSets(handlerSets, child.#children["*"], method, params, node.#params);
						} else {
							child.#params = params;
							tempNodes.push(child);
						}
					}
				}
			}
			const shifted = curNodesQueue.shift();
			curNodes = shifted ? tempNodes.concat(shifted) : tempNodes;
		}
		if (handlerSets[1]) handlerSets.sort((a, b) => {
			return a.score - b.score;
		});
		return [handlerSets.map(({ handler, params }) => [handler, params])];
	}
};
//#endregion
//#region node_modules/hono/dist/router/trie-router/router.js
var TrieRouter = class {
	name = "TrieRouter";
	#node = new Node();
	add(method, path, handler) {
		for (const result of checkOptionalParameter(path) || [path]) this.#node.insert(method, result, handler);
	}
	match(method, path) {
		return this.#node.search(method, path);
	}
};
//#endregion
//#region node_modules/hono/dist/hono.js
var Hono = class extends Hono$1 {
	/**
	* Creates an instance of the Hono class.
	*
	* @param options - Optional configuration options for the Hono instance.
	*/
	constructor(options = {}) {
		super(options);
		this.router = options.router ?? new SmartRouter({ routers: [new RegExpRouter(), new TrieRouter()] });
	}
};
//#endregion
//#region node_modules/hono/dist/middleware/body-limit/index.js
var ERROR_MESSAGE = "Payload Too Large";
var bodyLimit = (options) => {
	const onError = options.onError || (() => {
		throw new HTTPException(413, { res: new Response(ERROR_MESSAGE, { status: 413 }) });
	});
	const maxSize = options.maxSize;
	return async function bodyLimit2(c, next) {
		if (!c.req.raw.body) return next();
		const hasTransferEncoding = c.req.raw.headers.has("transfer-encoding");
		if (c.req.raw.headers.has("content-length") && !hasTransferEncoding) return parseInt(c.req.raw.headers.get("content-length") || "0", 10) > maxSize ? onError(c) : next();
		let size = 0;
		const chunks = [];
		const rawReader = c.req.raw.body.getReader();
		for (;;) {
			const { done, value } = await rawReader.read();
			if (done) break;
			size += value.length;
			if (size > maxSize) return onError(c);
			chunks.push(value);
		}
		const requestInit = {
			body: new ReadableStream({ start(controller) {
				for (const chunk of chunks) controller.enqueue(chunk);
				controller.close();
			} }),
			duplex: "half"
		};
		c.req.raw = new Request(c.req.raw, requestInit);
		return next();
	};
};
//#endregion
//#region server/seed.ts
/**
* The collection. Loaded into the database on first run (see server/db.ts). Images live in public/art.
*
* Titles and descriptions are written from what each painting shows.
* Year, canvas size, price and status are PLACEHOLDERS (sizes are estimated
* from each photo's proportions); replace them with the real details.
*/
var art = (file) => `/art/${file}.jpg`;
var seedArtworks = [
	{
		id: "peaches-and-cherries",
		title: "Peaches and Cherries",
		year: 2024,
		medium: "Oil on canvas",
		dimensions: "28 x 36 cm",
		price: 1450,
		status: "available",
		image: art("peaches-and-cherries"),
		story: "A brass bowl heaped with ripe peaches, two more resting on the ledge beside a sprig of cherries. Warm light falls from the left, picking out the gold rim of the bowl and the soft blush of each fruit against a deep, dark ground."
	},
	{
		id: "the-falls",
		title: "The Falls",
		year: 2024,
		medium: "Oil on canvas",
		dimensions: "30 x 60 cm",
		price: 1600,
		status: "reserved",
		image: art("the-falls"),
		story: "A wide panorama of white water pouring over rust-colored rocks. The spray is built up in thick, broken strokes of white and turquoise, so the surface of the paint itself seems to move."
	},
	{
		id: "still-life-with-grapes-and-plate",
		title: "Still Life with Grapes and Plate",
		year: 2024,
		medium: "Oil on canvas",
		dimensions: "30 x 40 cm",
		price: 1200,
		status: "sold",
		image: art("still-life-with-grapes-and-plate"),
		story: "Black and green grapes spill across a white cloth between a pomegranate, a plum, two peaches and an apple, with a green glass bottle and an upturned plate standing behind. A signed, classical table arrangement in warm, even light."
	},
	{
		id: "breaking-wave",
		title: "Breaking Wave",
		year: 2024,
		medium: "Oil on canvas",
		dimensions: "30 x 40 cm",
		price: 1350,
		status: "available",
		image: art("breaking-wave"),
		story: "A green wave rises between orange rocks as two sailboats hold their course out at sea. The light passes through the curl of the water, and the foam is laid on thickly with the brush."
	},
	{
		id: "red-roses-in-a-white-pot",
		title: "Red Roses in a White Pot",
		year: 2024,
		medium: "Oil on canvas",
		dimensions: "23 x 30 cm",
		price: 780,
		status: "available",
		image: art("red-roses-in-a-white-pot"),
		story: "Red roses crowd a blue-striped stoneware pot, with a loose spray of yellow roses and small wildflowers laid on the shelf beside it and a cluster of green grapes at the left."
	},
	{
		id: "pink-roses",
		title: "Pink Roses",
		year: 2024,
		medium: "Oil on canvas, framed",
		dimensions: "25 x 20 cm",
		price: 850,
		status: "sold",
		image: art("pink-roses-framed"),
		story: "Full pink roses in a tall white vase banded with blue, a few fallen petals on the table below. Signed at lower left. Sold in a carved dark wood frame."
	},
	{
		id: "green-bottle-and-grapes",
		title: "Green Bottle and Grapes",
		year: 2024,
		medium: "Oil on canvas",
		dimensions: "23 x 30 cm",
		price: 820,
		status: "available",
		image: art("green-bottle-and-grapes"),
		story: "A red apple, two bunches of grapes and a peach gathered in front of a green bottle and a tilted white dish, with a drape of white cloth falling at the right. Painted loosely, with bright highlights on every grape."
	},
	{
		id: "boats-at-sunset",
		title: "Boats at Sunset",
		year: 2024,
		medium: "Oil on canvas",
		dimensions: "25 x 20 cm",
		price: 690,
		status: "available",
		image: art("boats-at-sunset"),
		story: "Three rowing boats pulled up on the sand while an orange sky turns the whole bay gold. Gulls cross overhead and the surf breaks against a dark headland of rock."
	},
	{
		id: "sunflower",
		title: "Sunflower",
		year: 2024,
		medium: "Oil on canvas",
		dimensions: "25 x 20 cm",
		price: 620,
		status: "available",
		image: art("sunflower"),
		story: "A single sunflower fills the canvas against a soft lilac and blue sky. The seed head is worked in heavy, textured paint and the petals in quick, confident strokes."
	},
	{
		id: "cottage-by-the-stream",
		title: "Cottage by the Stream",
		year: 2024,
		medium: "Oil on canvas",
		dimensions: "23 x 30 cm",
		price: 890,
		status: "available",
		image: art("cottage-by-the-stream"),
		story: "A whitewashed cottage with a thatched roof sits in a meadow of wildflowers. Smoke rises from the chimney, a ladder leans on the wall, and a figure kneels to wash clothes at the edge of the stream."
	},
	{
		id: "houses-by-the-river",
		title: "Houses by the River",
		year: 2024,
		medium: "Oil on canvas",
		dimensions: "20 x 25 cm",
		price: 760,
		status: "available",
		image: art("houses-by-the-river"),
		story: "Two farmhouses stand at the edge of a pine forest, washing drying on the line and more laid out on the riverbank rocks. The river runs fast and pale across the foreground. Initialled at lower right."
	},
	{
		id: "two-pears-and-cherries",
		title: "Two Pears and Cherries",
		year: 2024,
		medium: "Oil on canvas",
		dimensions: "30 x 23 cm",
		price: 720,
		status: "available",
		image: art("two-pears-and-cherries"),
		story: "Two ripe pears lean together on a wooden board with three red cherries at their feet, set against a near-black background that makes the yellows glow."
	},
	{
		id: "yellow-roses-in-a-blue-vase",
		title: "Yellow Roses in a Blue Vase",
		year: 2024,
		medium: "Oil on canvas",
		dimensions: "25 x 20 cm",
		price: 680,
		status: "available",
		image: art("yellow-roses-in-a-blue-vase"),
		story: "A generous bunch of yellow roses in a turquoise vase, set on a white and lilac cloth against a black ground. The petals are thick with paint, and a few have dropped onto the table."
	},
	{
		id: "jar-apple-and-lemon",
		title: "Jar, Apple and Lemon",
		year: 2024,
		medium: "Oil on canvas",
		dimensions: "20 x 25 cm",
		price: 640,
		status: "available",
		image: art("jar-apple-and-lemon"),
		story: "A glass jar of sweets with a wooden lid, a red apple, a small lemon and a lidded white bowl, with folded papers behind. A careful study of glass, porcelain and fruit in side light."
	},
	{
		id: "swans-in-the-shade",
		title: "Swans in the Shade",
		year: 2024,
		medium: "Oil on canvas",
		dimensions: "20 x 20 cm",
		price: 560,
		status: "available",
		image: art("swans-in-the-shade"),
		story: "Three white swans glide across a green pond beneath hanging willow branches, the far bank lined with pale, lichen-covered stones."
	},
	{
		id: "red-and-yellow-roses",
		title: "Red and Yellow Roses",
		year: 2024,
		medium: "Oil on canvas",
		dimensions: "25 x 20 cm",
		price: 650,
		status: "available",
		image: art("red-and-yellow-roses"),
		story: "Three red and three yellow roses gathered in a clear glass vase, their stems visible through the water, floating on a soft grey-blue ground."
	},
	{
		id: "flowers-on-the-table",
		title: "Flowers on the Table",
		year: 2024,
		medium: "Oil on canvas",
		dimensions: "20 x 25 cm",
		price: 700,
		status: "available",
		image: art("flowers-on-the-table"),
		story: "Cut flowers in red, yellow, white and violet laid across the edge of a table, painted with rich, loaded strokes against a pale, cloudy background."
	},
	{
		id: "the-yellow-bird",
		title: "The Yellow Bird",
		year: 2024,
		medium: "Oil on canvas",
		dimensions: "25 x 20 cm",
		price: 740,
		status: "available",
		image: art("the-yellow-bird"),
		story: "A bright yellow songbird with a red face and blue wings perches on a tree stump beside pink blossoms, with blue-grey mountains and clouds behind."
	},
	{
		id: "bouquet-in-a-blue-jar",
		title: "Bouquet in a Blue Jar",
		year: 2024,
		medium: "Oil on canvas",
		dimensions: "30 x 23 cm",
		price: 780,
		status: "available",
		image: art("bouquet-in-a-blue-jar"),
		story: "A mixed bouquet of red, yellow, violet and white blooms in a deep blue glazed jar, petals scattered on a white cloth against a warm ochre wall."
	},
	{
		id: "sunset-over-the-river",
		title: "Sunset over the River",
		year: 2024,
		medium: "Oil on canvas",
		dimensions: "30 x 25 cm",
		price: 720,
		status: "available",
		image: art("sunset-over-the-river"),
		story: "An orange sun sets between dense green trees, and its light runs down the still river below. Birds cross the glowing sky at the top of the canvas."
	}
];
//#endregion
//#region server/sqlite.ts
var load = createRequire(import.meta.url);
function loadBuiltin() {
	try {
		return load("node:sqlite");
	} catch {
		return;
	}
}
/**
* sql.js is SQLite compiled to WebAssembly: no native build and nothing to install, so it runs on
* any host (e.g. Node 18 on Windows/IIS). The deploy package ships it in server/vendor;
* in development it comes from node_modules.
*/
async function loadSqlJs() {
	for (const id of ["./vendor/sql-wasm.cjs", "sql.js/dist/sql-wasm.js"]) {
		let path;
		try {
			path = load.resolve(id);
		} catch {
			continue;
		}
		return load(path)({ locateFile: (file) => join(dirname(path), file) });
	}
	throw new Error("No SQLite available: this needs Node 22.5+ (node:sqlite) or sql.js");
}
var builtin = loadBuiltin();
var sqlJs = builtin ? void 0 : await loadSqlJs();
/** Names the engine in use, for the startup log. */
var sqliteEngine = builtin ? "node:sqlite" : "sql.js";
/** Opens a SQLite database file (or ':memory:') with node:sqlite when available, otherwise sql.js. */
function openDatabase(file) {
	return builtin ? new builtin.DatabaseSync(file) : openSqlJs(sqlJs, file);
}
/**
* sql.js keeps the database in memory, so this writes the whole file after every change
* (outside a transaction, or on COMMIT). Fine for a small collection with few writes.
* Before each statement it reloads the file if another process changed it (e.g. while IIS
* recycles the app, old and new processes briefly overlap), so no process writes over newer data.
*/
function openSqlJs(SQL, file) {
	const persist = file !== ":memory:";
	let db = new SQL.Database();
	let version = "";
	let inTransaction = false;
	const fileVersion = () => {
		try {
			const { mtimeMs, size } = statSync(file);
			return `${mtimeMs}:${size}`;
		} catch {
			return "";
		}
	};
	const reload = () => {
		if (!persist || inTransaction) return;
		const current = fileVersion();
		if (current === version) return;
		if (current) {
			db.close();
			db = new SQL.Database(readFileSync(file));
			db.exec("PRAGMA foreign_keys = ON");
		}
		version = current;
	};
	const save = () => {
		if (!persist || inTransaction) return;
		const tmp = `${file}.${process.pid}.tmp`;
		writeFileSync(tmp, db.export());
		renameSync(tmp, file);
		version = fileVersion();
		db.exec("PRAGMA foreign_keys = ON");
	};
	reload();
	const params = (args) => {
		const [first] = args;
		if (args.length === 1 && first !== null && typeof first === "object" && !Array.isArray(first)) return Object.fromEntries(Object.entries(first).map(([k, v]) => [`:${k}`, v ?? null]));
		return args.map((v) => v ?? null);
	};
	return {
		exec(sql) {
			reload();
			db.exec(sql);
			const command = sql.trim().split(/\s+/)[0].toUpperCase();
			if (command === "BEGIN") inTransaction = true;
			else if (command === "COMMIT" || command === "ROLLBACK") {
				inTransaction = false;
				if (command === "COMMIT") save();
			} else save();
		},
		prepare(sql) {
			const query = (args, limit = Infinity) => {
				reload();
				const rows = [];
				const statement = db.prepare(sql);
				try {
					statement.bind(params(args));
					while (rows.length < limit && statement.step()) rows.push(statement.getAsObject());
				} finally {
					statement.free();
				}
				return rows;
			};
			return {
				run(...args) {
					reload();
					db.run(sql, params(args));
					save();
				},
				get: (...args) => query(args, 1)[0],
				all: (...args) => query(args)
			};
		},
		close: () => db.close()
	};
}
//#endregion
//#region server/db.ts
var SCHEMA = `
  CREATE TABLE IF NOT EXISTS artworks (
    id          TEXT PRIMARY KEY,
    title       TEXT NOT NULL,
    year        INTEGER NOT NULL,
    medium      TEXT NOT NULL,
    dimensions  TEXT NOT NULL,
    price       INTEGER NOT NULL CHECK (price > 0),
    status      TEXT NOT NULL CHECK (status IN ('available', 'reserved', 'sold')),
    image       TEXT NOT NULL,
    fallback    TEXT,
    story       TEXT NOT NULL,
    sort_order  INTEGER NOT NULL,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS orders (
    number      TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    email       TEXT NOT NULL,
    address     TEXT NOT NULL,
    city        TEXT NOT NULL,
    postcode    TEXT NOT NULL,
    country     TEXT NOT NULL,
    total       INTEGER NOT NULL,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- No foreign key to artworks: an order keeps its record even if the painting is later removed.
  CREATE TABLE IF NOT EXISTS order_items (
    order_number  TEXT NOT NULL REFERENCES orders (number),
    artwork_id    TEXT NOT NULL,
    title         TEXT NOT NULL,
    price         INTEGER NOT NULL,
    PRIMARY KEY (order_number, artwork_id)
  );
`;
var COLUMNS = "id, title, year, medium, dimensions, price, status, image, fallback, story";
var toArtwork = ({ fallback, ...row }) => fallback ? {
	...row,
	fallback
} : row;
/** Thrown when some of the requested paintings can no longer be bought. */
var UnavailableError = class extends Error {
	ids;
	constructor(ids) {
		super("Some paintings are no longer available");
		this.ids = ids;
	}
};
/** Opens (and on first run creates and seeds) the database. Pass ':memory:' for a throwaway one. */
function openRepository(file) {
	if (file !== ":memory:") mkdirSync(dirname(file), { recursive: true });
	const db = openDatabase(file);
	db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
	db.exec(SCHEMA);
	const transaction = (fn) => {
		db.exec("BEGIN IMMEDIATE");
		try {
			const result = fn();
			db.exec("COMMIT");
			return result;
		} catch (err) {
			db.exec("ROLLBACK");
			throw err;
		}
	};
	const insert = db.prepare(`
    INSERT INTO artworks (${COLUMNS}, sort_order)
    VALUES (:id, :title, :year, :medium, :dimensions, :price, :status, :image, :fallback, :story, :sort_order)
  `);
	const selectAll = db.prepare(`SELECT ${COLUMNS} FROM artworks ORDER BY sort_order`);
	const selectOne = db.prepare(`SELECT ${COLUMNS} FROM artworks WHERE id = ?`);
	if (db.prepare("SELECT COUNT(*) AS n FROM artworks").get().n === 0) transaction(() => seedArtworks.forEach((a, i) => insert.run({
		...a,
		fallback: a.fallback ?? null,
		sort_order: i
	})));
	const get = (id) => {
		const row = selectOne.get(id);
		return row && toArtwork(row);
	};
	return {
		list: () => selectAll.all().map(toArtwork),
		get,
		/** Adds a painting at the top of the collection. */
		create(id, fields, image) {
			const { top } = db.prepare("SELECT COALESCE(MIN(sort_order), 0) - 1 AS top FROM artworks").get();
			insert.run({
				...fields,
				id,
				image,
				fallback: null,
				sort_order: top
			});
			return get(id);
		},
		/** Updates the given fields (and image); returns undefined if the painting does not exist. */
		update(id, fields) {
			const keys = Object.keys(fields);
			if (keys.length > 0) db.prepare(`UPDATE artworks SET ${keys.map((k) => `${k} = :${k}`).join(", ")}, updated_at = datetime('now') WHERE id = :id`).run({
				...fields,
				id
			});
			return get(id);
		},
		/** Deletes a painting and returns it, or undefined if it did not exist. */
		remove(id) {
			const work = get(id);
			if (work) db.prepare("DELETE FROM artworks WHERE id = ?").run(id);
			return work;
		},
		/**
		* Records an order and marks its paintings sold, all or nothing.
		* Throws UnavailableError if any painting is missing or not available.
		*/
		placeOrder(ids, customer) {
			return transaction(() => {
				const items = ids.map((id) => get(id));
				const unavailable = ids.filter((_, i) => items[i]?.status !== "available");
				if (unavailable.length > 0) throw new UnavailableError(unavailable);
				const works = items;
				const total = works.reduce((sum, a) => sum + a.price, 0);
				let number;
				do
					number = `AT-${Math.floor(1e4 + Math.random() * 9e4)}`;
				while (db.prepare("SELECT 1 FROM orders WHERE number = ?").get(number));
				db.prepare(`
          INSERT INTO orders (number, name, email, address, city, postcode, country, total)
          VALUES (:number, :name, :email, :address, :city, :postcode, :country, :total)
        `).run({
					...customer,
					number,
					total
				});
				const addItem = db.prepare("INSERT INTO order_items (order_number, artwork_id, title, price) VALUES (?, ?, ?, ?)");
				const markSold = db.prepare("UPDATE artworks SET status = 'sold', updated_at = datetime('now') WHERE id = ?");
				for (const a of works) {
					addItem.run(number, a.id, a.title, a.price);
					markSold.run(a.id);
				}
				return {
					number,
					total,
					items: works.map((a) => ({
						...a,
						status: "sold"
					}))
				};
			});
		},
		close: () => db.close()
	};
}
//#endregion
//#region server/app.ts
var MAX_IMAGE_BYTES = 26214400;
var IMAGE_TYPES = {
	"image/jpeg": "jpg",
	"image/png": "png",
	"image/webp": "webp",
	"image/avif": "avif"
};
var STATUSES = [
	"available",
	"reserved",
	"sold"
];
/** Public URL prefix that uploaded images are served under. */
var UPLOADS_PATH = "/uploads/";
var slug = (s) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
var text = (v) => typeof v === "string" ? v.trim() : "";
/**
* Validates painting fields. With `partial`, only the fields present are checked and returned
* (for PATCH); otherwise every field is required. Numbers may arrive as strings from a form.
*/
function readFields(body, partial) {
	const fields = {};
	const errors = {};
	const has = (k) => !partial || body[k] !== void 0;
	for (const k of [
		"title",
		"medium",
		"dimensions",
		"story"
	]) {
		if (!has(k)) continue;
		const v = text(body[k]);
		if (v) fields[k] = v;
		else errors[k] = "Required";
	}
	if (has("year")) {
		const year = Number(body.year);
		if (Number.isInteger(year) && year >= 1900 && year <= (/* @__PURE__ */ new Date()).getFullYear() + 1) fields.year = year;
		else errors.year = "Enter a four-digit year";
	}
	if (has("price")) {
		const price = Number(String(body.price ?? "").replace(/[^0-9.]/g, ""));
		if (body.price !== "" && Number.isFinite(price) && price > 0) fields.price = Math.round(price);
		else errors.price = "Enter a price in US dollars";
	}
	if (has("status")) {
		if (STATUSES.includes(body.status)) fields.status = body.status;
		else errors.status = `Use one of: ${STATUSES.join(", ")}`;
	}
	return {
		fields,
		errors
	};
}
function readCustomer(body) {
	const source = body ?? {};
	const customer = {};
	const errors = {};
	for (const k of [
		"name",
		"email",
		"address",
		"city",
		"postcode",
		"country"
	]) {
		customer[k] = text(source[k]);
		if (!customer[k]) errors[k] = "Required";
	}
	if (customer.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email)) errors.email = "Enter a valid email address";
	return {
		customer,
		errors
	};
}
var hasErrors = (errors) => Object.keys(errors).length > 0;
/** An uploaded file. Checked as a Blob because Node 18 has no global File (form uploads are still Blobs). */
var isUpload = (v) => v instanceof Blob;
/** The HTTP API. `uploadsDir` is where uploaded images are written; the caller serves it at UPLOADS_PATH. */
function createApp(repo, uploadsDir) {
	const app = new Hono().basePath("/api");
	app.onError((err, c) => {
		console.error(err);
		return c.json({ error: "Something went wrong on the server" }, 500);
	});
	app.notFound((c) => c.json({ error: "Not found" }, 404));
	app.get("/artworks", (c) => c.json(repo.list()));
	app.get("/artworks/:id", (c) => {
		const work = repo.get(c.req.param("id"));
		return work ? c.json(work) : c.json({ error: "Painting not found" }, 404);
	});
	const imageLimit = bodyLimit({
		maxSize: 27262976,
		onError: (c) => c.json({
			error: "That file is over 25 MB",
			fields: { image: "That file is over 25 MB. Export a smaller version and try again." }
		}, 413)
	});
	/** Checks an uploaded image, adding to `errors`. Returns its file extension when valid. */
	function checkImage(file, errors) {
		const ext = isUpload(file) ? IMAGE_TYPES[file.type] : void 0;
		if (!isUpload(file)) errors.image = "Add an image of the painting.";
		else if (!ext) errors.image = "Use a JPEG, PNG, WebP or AVIF image.";
		else if (file.size > MAX_IMAGE_BYTES) errors.image = "That file is over 25 MB. Export a smaller version and try again.";
		return ext;
	}
	/** Writes an uploaded image and returns its public URL. */
	async function saveImage(file, filename) {
		await mkdir(uploadsDir, { recursive: true });
		await writeFile(join(uploadsDir, filename), Buffer.from(await file.arrayBuffer()));
		return UPLOADS_PATH + filename;
	}
	/** Deletes an uploaded image. Seed images in public/art belong to the site and are left alone. */
	async function deleteImage(url) {
		if (url.startsWith("/uploads/")) await unlink(join(uploadsDir, url.slice(9))).catch(() => {});
	}
	app.post("/artworks", imageLimit, async (c) => {
		const body = await c.req.parseBody();
		const { fields, errors } = readFields(body, false);
		const ext = checkImage(body.image, errors);
		if (hasErrors(errors) || !isUpload(body.image)) return c.json({
			error: "Check the highlighted fields",
			fields: errors
		}, 422);
		const id = `${slug(fields.title) || "untitled"}-${Date.now().toString(36)}`;
		const image = await saveImage(body.image, `${id}.${ext}`);
		try {
			return c.json(repo.create(id, fields, image), 201);
		} catch (err) {
			await deleteImage(image);
			throw err;
		}
	});
	app.patch("/artworks/:id", imageLimit, async (c) => {
		const multipart = c.req.header("content-type")?.startsWith("multipart/form-data");
		const body = multipart ? await c.req.parseBody() : await c.req.json().catch(() => null);
		if (!body || typeof body !== "object") return c.json({ error: "Send a JSON object" }, 400);
		const { fields, errors } = readFields(body, true);
		const file = multipart ? body.image : void 0;
		const ext = file === void 0 ? void 0 : checkImage(file, errors);
		if (hasErrors(errors)) return c.json({
			error: "Check the highlighted fields",
			fields: errors
		}, 422);
		const current = repo.get(c.req.param("id"));
		if (!current) return c.json({ error: "Painting not found" }, 404);
		if (!isUpload(file)) return c.json(repo.update(current.id, fields));
		const image = await saveImage(file, `${current.id}-${Date.now().toString(36)}.${ext}`);
		try {
			const work = repo.update(current.id, {
				...fields,
				image
			});
			await deleteImage(current.image);
			return c.json(work);
		} catch (err) {
			await deleteImage(image);
			throw err;
		}
	});
	app.delete("/artworks/:id", async (c) => {
		const work = repo.remove(c.req.param("id"));
		if (!work) return c.json({ error: "Painting not found" }, 404);
		await deleteImage(work.image);
		return c.body(null, 204);
	});
	app.post("/orders", async (c) => {
		const body = await c.req.json().catch(() => null);
		const ids = Array.isArray(body?.artworkIds) ? [...new Set(body.artworkIds.filter((id) => typeof id === "string"))] : [];
		if (ids.length === 0) return c.json({ error: "The order has no paintings" }, 400);
		const { customer, errors } = readCustomer(body?.customer);
		if (hasErrors(errors)) return c.json({
			error: "Check the highlighted fields",
			fields: errors
		}, 422);
		try {
			return c.json(repo.placeOrder(ids, customer), 201);
		} catch (err) {
			if (err instanceof UnavailableError) return c.json({
				error: "Some paintings in your cart are no longer available",
				unavailable: err.ids
			}, 409);
			throw err;
		}
	});
	return app;
}
//#endregion
//#region server/index.ts
var here = dirname(fileURLToPath(import.meta.url));
var portSetting = process.env.PORT ?? "3001";
var port = /^\d+$/.test(portSetting) ? Number(portSetting) : portSetting;
var dataDir = resolve(process.env.DATA_DIR ?? join(here, "data"));
var uploadsDir = join(dataDir, "uploads");
var distDir = resolve(here, "..", "dist");
var repo = openRepository(join(dataDir, "artetotal.db"));
mkdirSync(uploadsDir, { recursive: true });
var app = new Hono();
app.route("/", createApp(repo, uploadsDir));
app.use(`${UPLOADS_PATH}*`, serveStatic({
	root: uploadsDir,
	rewriteRequestPath: (p) => p.slice(UPLOADS_PATH.length - 1)
}));
if (existsSync(distDir)) {
	app.use("*", serveStatic({ root: distDir }));
	app.get("*", serveStatic({
		root: distDir,
		path: "index.html"
	}));
}
var server = createServer(getRequestListener(app.fetch));
server.listen(port, () => {
	const where = typeof port === "number" ? `http://localhost:${port}/api` : `pipe ${port}`;
	console.log(`ArteTotal API on ${where} (${sqliteEngine}, data in ${dataDir})`);
});
var shutdown = () => server.close(() => (repo.close(), process.exit(0)));
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
//#endregion
export {};
