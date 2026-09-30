exports.handler = async (event) => {
	const request = event.Records[0].cf.request;
	const uri = request.uri;

	// If the request is for a directory (no file extension), append index.html
	if (uri.endsWith('/')) {
		request.uri += 'index.html';
	} else if (!uri.includes('.')) {
		// If no extension and not ending in /, assume it's a route and append /index.html
		request.uri += '/index.html';
	}

	return request;
};
