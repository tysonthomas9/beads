package main

import (
	"log"
	"net"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"strings"
	"time"
)

const defaultLoomServerURL = "http://localhost:9000"

// newLoomProxy returns a reverse proxy for the loom API or nil if misconfigured.
func newLoomProxy() http.Handler {
	loomURL := strings.TrimSpace(os.Getenv("LOOM_SERVER_URL"))
	if loomURL == "" {
		loomURL = defaultLoomServerURL
	}

	target, err := url.Parse(loomURL)
	if err != nil || target.Scheme == "" || target.Host == "" {
		log.Printf("loom proxy disabled: invalid LOOM_SERVER_URL=%q", loomURL)
		return nil
	}

	proxy := httputil.NewSingleHostReverseProxy(target)
	originalDirector := proxy.Director
	debug := os.Getenv("LOOM_PROXY_DEBUG") == "1"

	if debug {
		proxy.ErrorHandler = func(w http.ResponseWriter, r *http.Request, err error) {
			log.Printf("loom proxy error %s %s: %v", r.Method, r.URL.String(), err)
		}
	}

	proxy.Director = func(req *http.Request) {
		originalDirector(req)
		req.URL.Path = strings.TrimPrefix(req.URL.Path, "/api/loom")
		if req.URL.Path == "" {
			req.URL.Path = "/"
		}
		req.Host = target.Host
		if debug {
			log.Printf("loom proxy %s %s", req.Method, req.URL.String())
		}
	}

	return proxy
}
