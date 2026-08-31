import React from "react";

export interface RemoteAppRoute {
	route: string;
	label: string;
	Component: React.LazyExoticComponent<React.ComponentType<unknown>>;
}

export interface RemoteConfigEntry {
	scope: string;
	url: string;
	module: string;
	route: string;
	label: string;
}
