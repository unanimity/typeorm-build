import { QueryRunnerAlreadyReleasedError } from "../../error/QueryRunnerAlreadyReleasedError";
import { QueryFailedError } from "../../error/QueryFailedError";
import { AbstractSqliteQueryRunner } from "../sqlite-abstract/AbstractSqliteQueryRunner";
import { Broadcaster } from "../../subscriber/Broadcaster";
import { QueryResult } from "../../query-runner/QueryResult";
import { BroadcasterResult } from "../../subscriber/BroadcasterResult";
/**
 * Runs queries on a single sqlite database connection.
 */
export class ReactNativeQueryRunner extends AbstractSqliteQueryRunner {
    // -------------------------------------------------------------------------
    // Constructor
    // -------------------------------------------------------------------------
    constructor(driver) {
        super();
        this.driver = driver;
        this.connection = driver.connection;
        this.broadcaster = new Broadcaster(this);
    }
    /**
     * Called before migrations are run.
     */
    async beforeMigration() {
        await this.query(`PRAGMA foreign_keys = OFF`);
    }
    /**
     * Called after migrations are run.
     */
    async afterMigration() {
        await this.query(`PRAGMA foreign_keys = ON`);
    }
    /**
     * Executes a given SQL query.
     */
    query(query, parameters, useStructuredResult = false) {
        if (this.isReleased)
            throw new QueryRunnerAlreadyReleasedError();
        return new Promise(async (ok, fail) => {
            const databaseConnection = await this.connect();
            const broadcasterResult = new BroadcasterResult();
            this.driver.connection.logger.logQuery(query, parameters, this);
            this.broadcaster.broadcastBeforeQueryEvent(broadcasterResult, query, parameters);
            const queryStartTime = +new Date();
            databaseConnection.executeSql(query, parameters, async (raw) => {
                // log slow queries if maxQueryExecution time is set
                const maxQueryExecutionTime = this.driver.options.maxQueryExecutionTime;
                const queryEndTime = +new Date();
                const queryExecutionTime = queryEndTime - queryStartTime;
                this.broadcaster.broadcastAfterQueryEvent(broadcasterResult, query, parameters, true, queryExecutionTime, raw, undefined);
                if (maxQueryExecutionTime &&
                    queryExecutionTime > maxQueryExecutionTime)
                    this.driver.connection.logger.logQuerySlow(queryExecutionTime, query, parameters, this);
                if (broadcasterResult.promises.length > 0)
                    await Promise.all(broadcasterResult.promises);
                const result = new QueryResult();
                if (raw?.hasOwnProperty("rowsAffected")) {
                    result.affected = raw.rowsAffected;
                }
                if (raw?.hasOwnProperty("rows")) {
                    let records = [];
                    for (let i = 0; i < raw.rows.length; i++) {
                        records.push(raw.rows.item(i));
                    }
                    result.raw = records;
                    result.records = records;
                }
                // return id of inserted row, if query was insert statement.
                if (query.substr(0, 11) === "INSERT INTO") {
                    result.raw = raw.insertId;
                }
                if (useStructuredResult) {
                    ok(result);
                }
                else {
                    ok(result.raw);
                }
            }, async (err) => {
                this.driver.connection.logger.logQueryError(err, query, parameters, this);
                this.broadcaster.broadcastAfterQueryEvent(broadcasterResult, query, parameters, false, undefined, undefined, err);
                await broadcasterResult.wait();
                fail(new QueryFailedError(query, parameters, err));
            });
        });
    }
    // -------------------------------------------------------------------------
    // Protected Methods
    // -------------------------------------------------------------------------
    /**
     * Parametrizes given object of values. Used to create column=value queries.
     */
    parametrize(objectLiteral, startIndex = 0) {
        return Object.keys(objectLiteral).map((key, index) => `"${key}"` + "=?");
    }
}

//# sourceMappingURL=ReactNativeQueryRunner.js.map
