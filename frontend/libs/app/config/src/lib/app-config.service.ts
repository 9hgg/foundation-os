import { Injectable } from '@angular/core';
import { createBehaviorSubjectProxy } from '@foundation/utils';
import { Observable } from 'rxjs';
@Injectable({
	providedIn: 'root',
})
export class AppConfigService {
	config$_ = createBehaviorSubjectProxy<any>({});
	config$: Observable<any> = this.config$_.$;
}
